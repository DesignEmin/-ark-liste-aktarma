import { env } from "@/lib/server/config";
import { AppError, notConfigured } from "@/lib/server/errors";
import { chunk, Limiter, throwForStatus, upstreamFetch } from "@/lib/server/http";
import { LIKED_ID, type Page, type PlaylistSummary, type Track } from "@/lib/types";
import type { CallbackParams, LoginParams, MusicAdapter, SearchQuery, StoredToken } from "./types";

// Deezer API — https://developers.deezer.com/api
//  - Sınır: 5 saniyede 50 istek. Aşılınca HTTP 200 + {error:{code:4}} döner.
//  - OAuth "state" parametresini desteklemediği için state'i redirect_uri'nin
//    sorgu kısmına ekliyoruz (Deezer yalnızca alan adını doğrular).
//  - "offline_access" izniyle alınan token'ın süresi dolmaz (expires = 0).

const CONNECT = "https://connect.deezer.com/oauth";
const API = "https://api.deezer.com";
const PERMS = "basic_access,offline_access,manage_library,delete_library";
const PLATFORM = "Deezer";
const limiter = new Limiter(3, 110);

interface DeezerTrack {
  id: number;
  title: string;
  title_short?: string;
  duration?: number;
  isrc?: string;
  link?: string;
  readable?: boolean;
  type?: string;
  artist?: { name: string };
  contributors?: { name: string; role?: string }[];
  album?: { title: string };
}

interface DeezerList<T> {
  data: T[];
  total?: number;
  next?: string;
}

interface DeezerError {
  error?: { type?: string; message?: string; code?: number };
}

async function call<T>(token: StoredToken | null, path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${API}${path}`);
  if (token) url.searchParams.set("access_token", token.accessToken);

  for (let attempt = 0; ; attempt++) {
    const res = await upstreamFetch(url.toString(), { ...init, limiter, platform: PLATFORM });
    if (!res.ok) await throwForStatus(res, PLATFORM);
    const data = (await res.json()) as T & DeezerError;
    const err = typeof data === "object" && data !== null ? data.error : undefined;
    if (!err) return data;

    if (err.code === 4 && attempt < 3) {
      // Kota aşıldı: Deezer 5 sn'lik pencere kullanıyor.
      limiter.pause(5000);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (err.code === 4) throw new AppError("RATE_LIMITED", "Deezer istek sınırı aşıldı.", 429, 5);
    if (err.code === 800) throw new AppError("NOT_FOUND", "Deezer: kayıt bulunamadı.", 404);
    if (err.type === "OAuthException" || err.code === 200 || err.code === 300) {
      throw new AppError("NOT_AUTHENTICATED", "Deezer oturumu geçersiz. Lütfen tekrar giriş yapın.", 401);
    }
    throw new AppError("UPSTREAM_ERROR", `Deezer hatası: ${err.message ?? "bilinmeyen"}`, 502);
  }
}

function toTrack(t: DeezerTrack): Track | null {
  if (!t || !t.id || (t.type && t.type !== "track")) return null;
  const main = t.artist?.name;
  const extra = (t.contributors ?? []).map((c) => c.name).filter((n) => n && n !== main);
  return {
    id: String(t.id),
    platform: "deezer",
    title: t.title,
    artists: [main, ...extra].filter((n): n is string => Boolean(n)),
    album: t.album?.title,
    durationMs: t.duration ? t.duration * 1000 : undefined,
    isrc: t.isrc?.toUpperCase(),
    url: t.link,
  };
}

function pageOf(list: DeezerList<DeezerTrack>, index: number, size: number): Page<Track> {
  return {
    items: list.data.map(toTrack).filter((t): t is Track => t !== null),
    nextCursor: list.next ? String(index + size) : null,
    total: list.total,
  };
}

/** Deezer gelişmiş arama sözdiziminde çift tırnak özel karakterdir. */
const quote = (s: string) => `"${s.replace(/"/g, " ").trim()}"`;

export const deezerAdapter: MusicAdapter = {
  id: "deezer",
  displayName: "Deezer",
  capabilities: { isrcSearch: true, maxAddBatch: 50, maxLikeBatch: 25, authMode: "oauth-redirect" },

  isConfigured: () => Boolean(env("DEEZER_APP_ID") && env("DEEZER_APP_SECRET")),

  login({ redirectUri, state }: LoginParams) {
    if (!env("DEEZER_APP_ID")) throw notConfigured(PLATFORM);
    const redirect = `${redirectUri}?state=${encodeURIComponent(state)}`;
    const params = new URLSearchParams({ app_id: env("DEEZER_APP_ID"), redirect_uri: redirect, perms: PERMS });
    return { type: "redirect", url: `${CONNECT}/auth.php?${params}` };
  },

  async handleCallback({ code }: CallbackParams) {
    const params = new URLSearchParams({
      app_id: env("DEEZER_APP_ID"),
      secret: env("DEEZER_APP_SECRET"),
      code,
      output: "json",
    });
    const res = await upstreamFetch(`${CONNECT}/access_token.php?${params}`, { limiter, platform: PLATFORM });
    if (!res.ok) await throwForStatus(res, PLATFORM);
    const text = await res.text();
    let data: { access_token?: string; expires?: number | string };
    try {
      data = JSON.parse(text);
    } catch {
      data = Object.fromEntries(new URLSearchParams(text));
    }
    if (!data.access_token) throw new AppError("NOT_AUTHENTICATED", "Deezer giriş kodu geçersiz.", 401);
    const expires = Number(data.expires ?? 0);
    const token: StoredToken = {
      accessToken: data.access_token,
      expiresAt: expires > 0 ? Date.now() + expires * 1000 : undefined,
    };
    const me = await call<{ id: number; name: string }>(token, "/user/me");
    return { ...token, userId: String(me.id), userName: me.name };
  },

  async getPlaylists(token, cursor) {
    const index = Number(cursor ?? 0);
    const size = 50;
    const list = await call<
      DeezerList<{ id: number; title: string; nb_tracks?: number; picture_medium?: string; creator?: { id: number; name: string }; is_loved_track?: boolean }>
    >(token, `/user/me/playlists?index=${index}&limit=${size}`);

    const items: PlaylistSummary[] = [];
    if (index === 0) {
      const liked = await call<DeezerList<unknown>>(token, "/user/me/tracks?limit=1");
      items.push({ id: LIKED_ID, name: "Favori Parçalar", kind: "liked", trackCount: liked.total });
    }
    for (const p of list.data) {
      if (p.is_loved_track) continue; // "Favori parçalar" listesi zaten yukarıda
      items.push({
        id: String(p.id),
        name: p.title,
        kind: "playlist",
        trackCount: p.nb_tracks,
        imageUrl: p.picture_medium,
        owner: p.creator?.name,
      });
    }
    return { items, nextCursor: list.next ? String(index + size) : null, total: list.total };
  },

  async getLikedTracks(token, cursor) {
    const index = Number(cursor ?? 0);
    const size = 100;
    return pageOf(await call(token, `/user/me/tracks?index=${index}&limit=${size}`), index, size);
  },

  async getPlaylistTracks(token, playlistId, cursor) {
    if (playlistId === LIKED_ID) return this.getLikedTracks(token, cursor);
    const index = Number(cursor ?? 0);
    const size = 100;
    return pageOf(
      await call(token, `/playlist/${encodeURIComponent(playlistId)}/tracks?index=${index}&limit=${size}`),
      index,
      size,
    );
  },

  async searchTrack(token, query: SearchQuery) {
    if (query.kind === "isrc") {
      try {
        const t = await call<DeezerTrack>(token, `/track/isrc:${encodeURIComponent(query.isrc)}`);
        const track = toTrack(t);
        return track ? [track] : [];
      } catch (err) {
        if (err instanceof AppError && err.code === "NOT_FOUND") return [];
        throw err;
      }
    }
    const q = query.artist ? `artist:${quote(query.artist)} track:${quote(query.title)}` : query.title;
    const list = await call<DeezerList<DeezerTrack>>(
      token,
      `/search/track?q=${encodeURIComponent(q)}&limit=${query.limit ?? 10}`,
    );
    return list.data.map(toTrack).filter((t): t is Track => t !== null);
  },

  async createPlaylist(token, name) {
    const data = await call<{ id: number }>(token, `/user/me/playlists?title=${encodeURIComponent(name)}`, {
      method: "POST",
    });
    return { id: String(data.id), url: `https://www.deezer.com/playlist/${data.id}` };
  },

  async addTracks(token, playlistId, trackIds) {
    for (const ids of chunk(trackIds, 50)) {
      await call(token, `/playlist/${encodeURIComponent(playlistId)}/tracks?songs=${ids.join(",")}`, {
        method: "POST",
      });
    }
  },

  async likeTrack(token, trackIds) {
    // Deezer favorilere tek tek eklemeye izin veriyor.
    for (const id of trackIds) {
      try {
        await call(token, `/user/me/tracks?track_id=${encodeURIComponent(id)}`, { method: "POST" });
      } catch (err) {
        // Zaten favorideyse Deezer hata döndürebilir; aktarımı durdurmaya gerek yok.
        if (!(err instanceof AppError && err.code === "UPSTREAM_ERROR")) throw err;
      }
    }
  },
};
