import { getAppleDeveloperToken, isAppleConfigured } from "@/lib/server/apple-jwt";
import { env } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";
import { chunk, Limiter, throwForStatus, upstreamFetch } from "@/lib/server/http";
import { splitArtists } from "@/lib/matching/normalize";
import { LIKED_ID, type Page, type PlaylistSummary, type Track } from "@/lib/types";
import type { MusicAdapter, SearchQuery, StoredToken } from "./types";

// Apple Music API — https://developer.apple.com/documentation/applemusicapi
//  - Giriş MusicKit JS ile tarayıcıda yapılır; dönen "Music User Token" sunucuya
//    gönderilip şifreli çerezde saklanır (bkz. /api/auth/apple/user-token).
//  - Apple API'sinde "beğenilen şarkılar" listesi yoktur. Kaynak olarak kitaplıktaki
//    şarkılar kullanılır; hedefte "beğenme" = kitaplığa ekle + "Sevdim" olarak işaretle.
//  - Katalog kimlikleri mağazaya (ülkeye) göre değişir; kullanıcının mağazası kullanılır.

const API = "https://api.music.apple.com/v1";
const PLATFORM = "Apple Music";
const limiter = new Limiter(4, 50);

interface SongAttributes {
  name: string;
  artistName: string;
  albumName?: string;
  durationInMillis?: number;
  isrc?: string;
  url?: string;
  playParams?: { id: string; catalogId?: string };
}

interface AppleResource<A> {
  id: string;
  type: string;
  attributes?: A;
  relationships?: { catalog?: { data: AppleResource<SongAttributes>[] } };
}

interface AppleList<A> {
  data: AppleResource<A>[];
  next?: string;
  meta?: { total?: number };
}

async function api<T>(token: StoredToken | null, path: string, init: RequestInit = {}): Promise<T> {
  const developerToken = await getAppleDeveloperToken("server");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${developerToken}`,
    "Content-Type": "application/json",
  };
  if (token) headers["Music-User-Token"] = token.accessToken;
  const res = await upstreamFetch(`${API}${path}`, { ...init, headers, limiter, platform: PLATFORM });
  if (!res.ok) await throwForStatus(res, PLATFORM);
  if (res.status === 202 || res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function storefront(token: StoredToken): string {
  return token.storefront || env("APPLE_DEFAULT_STOREFRONT") || "us";
}

function toTrack(r: AppleResource<SongAttributes>): Track | null {
  const a = r.attributes;
  if (!a) return null;
  const catalog = r.relationships?.catalog?.data?.[0];
  const catalogAttrs = catalog?.attributes;
  const catalogId = catalog?.id ?? a.playParams?.catalogId ?? (r.type === "songs" ? r.id : undefined);
  return {
    // Katalog kimliği varsa onu kullan: hedefe eklerken gereken kimlik budur.
    id: catalogId ?? r.id,
    platform: "apple",
    title: a.name,
    artists: splitArtists(a.artistName),
    album: a.albumName,
    durationMs: a.durationInMillis ?? catalogAttrs?.durationInMillis,
    isrc: (a.isrc ?? catalogAttrs?.isrc)?.toUpperCase(),
    url: a.url ?? catalogAttrs?.url,
  };
}

function nextCursor(list: { next?: string }, offset: number, size: number) {
  return list.next ? String(offset + size) : null;
}

async function libraryTracks(token: StoredToken, path: string, cursor?: string | null): Promise<Page<Track>> {
  const offset = Number(cursor ?? 0);
  const size = 100;
  const sep = path.includes("?") ? "&" : "?";
  try {
    const list = await api<AppleList<SongAttributes>>(token, `${path}${sep}limit=${size}&offset=${offset}&include=catalog`);
    return {
      items: list.data.map(toTrack).filter((t): t is Track => t !== null),
      nextCursor: nextCursor(list, offset, size),
      total: list.meta?.total,
    };
  } catch (err) {
    // Apple boş listeler için 404 döndürür.
    if (err instanceof AppError && err.code === "NOT_FOUND") return { items: [], nextCursor: null, total: 0 };
    throw err;
  }
}

export const appleAdapter: MusicAdapter = {
  id: "apple",
  displayName: "Apple Music",
  capabilities: { isrcSearch: true, maxAddBatch: 100, maxLikeBatch: 25, authMode: "musickit" },

  isConfigured: isAppleConfigured,

  login() {
    return { type: "musickit" };
  },

  async getPlaylists(token, cursor) {
    const offset = Number(cursor ?? 0);
    const size = 100;
    const list = await api<
      AppleList<{ name: string; description?: { standard?: string }; artwork?: { url: string }; canEdit?: boolean }>
    >(token, `/me/library/playlists?limit=${size}&offset=${offset}`);

    const items: PlaylistSummary[] = [];
    if (offset === 0) {
      items.push({
        id: LIKED_ID,
        name: "Kitaplıktaki Şarkılar",
        kind: "liked",
        warning: "Apple Music'te ayrı bir 'beğenilenler' listesi olmadığı için kitaplığınızdaki tüm şarkılar alınır.",
      });
    }
    for (const p of list.data) {
      items.push({
        id: p.id,
        name: p.attributes?.name ?? "Adsız liste",
        description: p.attributes?.description?.standard,
        kind: "playlist",
        imageUrl: p.attributes?.artwork?.url?.replace("{w}", "120").replace("{h}", "120"),
      });
    }
    return { items, nextCursor: nextCursor(list, offset, size), total: list.meta?.total };
  },

  getLikedTracks(token, cursor) {
    return libraryTracks(token, "/me/library/songs", cursor);
  },

  getPlaylistTracks(token, playlistId, cursor) {
    if (playlistId === LIKED_ID) return this.getLikedTracks(token, cursor);
    return libraryTracks(token, `/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`, cursor);
  },

  async searchTrack(token, query: SearchQuery) {
    const sf = storefront(token);
    if (query.kind === "isrc") {
      const list = await api<AppleList<SongAttributes>>(
        token,
        `/catalog/${sf}/songs?filter[isrc]=${encodeURIComponent(query.isrc)}`,
      );
      return list.data.map(toTrack).filter((t): t is Track => t !== null);
    }
    const term = [query.artist, query.title].filter(Boolean).join(" ");
    const data = await api<{ results: { songs?: AppleList<SongAttributes> } }>(
      token,
      `/catalog/${sf}/search?types=songs&limit=${Math.min(query.limit ?? 10, 25)}&term=${encodeURIComponent(term)}`,
    );
    return (data.results.songs?.data ?? []).map(toTrack).filter((t): t is Track => t !== null);
  },

  async createPlaylist(token, name, description) {
    const data = await api<{ data: { id: string }[] }>(token, "/me/library/playlists", {
      method: "POST",
      body: JSON.stringify({ attributes: { name, description: description ?? "" } }),
    });
    return { id: data.data[0].id };
  },

  async addTracks(token, playlistId, trackIds) {
    for (const ids of chunk(trackIds, 100)) {
      await api(token, `/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`, {
        method: "POST",
        body: JSON.stringify({ data: ids.map((id) => ({ id, type: "songs" })) }),
      });
    }
  },

  async likeTrack(token, trackIds) {
    for (const ids of chunk(trackIds, 25)) {
      await api(token, `/me/library?ids[songs]=${ids.map(encodeURIComponent).join(",")}`, { method: "POST" });
      for (const id of ids) {
        await api(token, `/me/ratings/songs/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ type: "rating", attributes: { value: 1 } }),
        });
      }
    }
  },
};

/** MusicKit'ten gelen kullanıcı token'ını doğrular ve kullanıcının mağazasını döndürür. */
export async function verifyAppleUserToken(musicUserToken: string): Promise<StoredToken> {
  const token: StoredToken = { accessToken: musicUserToken };
  const data = await api<{ data: { id: string }[] }>(token, "/me/storefront");
  return { ...token, storefront: data.data[0]?.id, userName: "Apple Music" };
}
