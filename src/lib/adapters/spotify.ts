import { env } from "@/lib/server/config";
import { notConfigured } from "@/lib/server/errors";
import { chunk, fetchJson, Limiter, throwForStatus, upstreamFetch } from "@/lib/server/http";
import { LIKED_ID, type Page, type PlaylistSummary, type Track } from "@/lib/types";
import type { CallbackParams, LoginParams, MusicAdapter, SearchQuery, StoredToken } from "./types";

// Spotify Web API — Şubat 2026 değişikliklerine göre yazıldı:
//  - Liste şarkıları: /playlists/{id}/items (eski /tracks kaldırıldı), öğe alanı "item".
//  - Liste oluşturma: POST /me/playlists
//  - Beğenme: PUT /me/library?uris=... (istek başına en fazla 40 URI)
//  - Arama: istek başına en fazla 10 sonuç
//  - Geliştirici modunda şarkı nesnelerinde external_ids (ISRC) dönmeyebilir;
//    bu durumda eşleştirme otomatik olarak metin aramasına düşer.

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
  "user-library-modify",
].join(" ");

const limiter = new Limiter(4, 60);
const PLATFORM = "Spotify";

interface SpotifyTrack {
  id: string | null;
  type?: string;
  name: string;
  duration_ms: number;
  is_local?: boolean;
  artists: { name: string }[];
  album?: { name: string };
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
}

interface SpotifyPaging<T> {
  items: T[];
  total: number;
  next: string | null;
}

function clientId() {
  return env("SPOTIFY_CLIENT_ID");
}

function basicAuth() {
  return "Basic " + Buffer.from(`${env("SPOTIFY_CLIENT_ID")}:${env("SPOTIFY_CLIENT_SECRET")}`).toString("base64");
}

async function tokenRequest(body: Record<string, string>) {
  const res = await upstreamFetch(`${ACCOUNTS}/api/token`, {
    limiter,
    platform: PLATFORM,
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) await throwForStatus(res, PLATFORM);
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

function api<T>(token: StoredToken, path: string, init: RequestInit = {}) {
  return fetchJson<T>(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    limiter,
    platform: PLATFORM,
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function toTrack(t: SpotifyTrack): Track | null {
  if (!t || !t.id || t.is_local || (t.type && t.type !== "track")) return null;
  return {
    id: t.id,
    platform: "spotify",
    title: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album?.name,
    durationMs: t.duration_ms,
    isrc: t.external_ids?.isrc?.toUpperCase(),
    url: t.external_urls?.spotify,
  };
}

function nextOffset(paging: { next: string | null }, offset: number, size: number): string | null {
  return paging.next ? String(offset + size) : null;
}

export const spotifyAdapter: MusicAdapter = {
  id: "spotify",
  displayName: "Spotify",
  capabilities: { isrcSearch: true, maxAddBatch: 100, maxLikeBatch: 40, authMode: "oauth-redirect" },

  isConfigured: () => Boolean(env("SPOTIFY_CLIENT_ID") && env("SPOTIFY_CLIENT_SECRET")),

  login({ redirectUri, state, codeChallenge }: LoginParams) {
    if (!this.isConfigured()) throw notConfigured(PLATFORM);
    const params = new URLSearchParams({
      client_id: clientId(),
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
    });
    return { type: "redirect", url: `${ACCOUNTS}/authorize?${params}` };
  },

  async handleCallback({ code, redirectUri, codeVerifier }: CallbackParams) {
    const data = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    const token: StoredToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    const me = await api<{ id: string; display_name?: string }>(token, "/me");
    return { ...token, userId: me.id, userName: me.display_name ?? me.id };
  },

  async refresh(token) {
    const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: token.refreshToken ?? "" });
    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  },

  async getPlaylists(token, cursor) {
    const offset = Number(cursor ?? 0);
    const size = 50;
    const page = await api<
      SpotifyPaging<{
        id: string;
        name: string;
        description?: string;
        collaborative?: boolean;
        images?: { url: string }[] | null;
        owner?: { id: string; display_name?: string };
        items?: { total: number };
        tracks?: { total: number };
      } | null>
    >(token, `/me/playlists?limit=${size}&offset=${offset}`);

    const items: PlaylistSummary[] = [];
    if (offset === 0) {
      const liked = await api<SpotifyPaging<unknown>>(token, "/me/tracks?limit=1");
      items.push({ id: LIKED_ID, name: "Beğenilen Şarkılar", kind: "liked", trackCount: liked.total });
    }
    for (const p of page.items) {
      if (!p) continue;
      const owned = !p.owner || p.owner.id === token.userId;
      items.push({
        id: p.id,
        name: p.name,
        description: p.description || undefined,
        kind: "playlist",
        trackCount: p.items?.total ?? p.tracks?.total,
        imageUrl: p.images?.[0]?.url,
        owner: p.owner?.display_name,
        warning:
          owned || p.collaborative
            ? undefined
            : "Spotify geliştirici modunda yalnızca size ait listelerin şarkıları okunabilir.",
      });
    }
    return { items, nextCursor: nextOffset(page, offset, size), total: page.total + (offset === 0 ? 1 : 0) };
  },

  async getLikedTracks(token, cursor) {
    const offset = Number(cursor ?? 0);
    const size = 50;
    const page = await api<SpotifyPaging<{ track: SpotifyTrack }>>(token, `/me/tracks?limit=${size}&offset=${offset}`);
    return {
      items: page.items.map((i) => toTrack(i.track)).filter((t): t is Track => t !== null),
      nextCursor: nextOffset(page, offset, size),
      total: page.total,
    };
  },

  async getPlaylistTracks(token, playlistId, cursor) {
    if (playlistId === LIKED_ID) return this.getLikedTracks(token, cursor);
    const offset = Number(cursor ?? 0);
    const size = 100;
    const page = await api<SpotifyPaging<{ item?: SpotifyTrack | null; track?: SpotifyTrack | null }>>(
      token,
      `/playlists/${encodeURIComponent(playlistId)}/items?limit=${size}&offset=${offset}&additional_types=track`,
    );
    return {
      items: page.items
        .map((i) => toTrack((i.item ?? i.track) as SpotifyTrack))
        .filter((t): t is Track => t !== null),
      nextCursor: nextOffset(page, offset, size),
      total: page.total,
    };
  },

  async searchTrack(token, query: SearchQuery) {
    const q = query.kind === "isrc" ? `isrc:${query.isrc}` : [query.title, query.artist].filter(Boolean).join(" ");
    const limit = query.kind === "text" ? Math.min(query.limit ?? 10, 10) : 5;
    const data = await api<{ tracks: SpotifyPaging<SpotifyTrack> }>(
      token,
      `/search?type=track&limit=${limit}&q=${encodeURIComponent(q)}`,
    );
    return data.tracks.items.map(toTrack).filter((t): t is Track => t !== null);
  },

  async createPlaylist(token, name, description) {
    const data = await api<{ id: string; external_urls?: { spotify?: string } }>(token, "/me/playlists", {
      method: "POST",
      body: JSON.stringify({ name, description: description ?? "", public: false }),
    });
    return { id: data.id, url: data.external_urls?.spotify };
  },

  async addTracks(token, playlistId, trackIds) {
    for (const ids of chunk(trackIds, 100)) {
      await api(token, `/playlists/${encodeURIComponent(playlistId)}/items`, {
        method: "POST",
        body: JSON.stringify({ uris: ids.map((id) => `spotify:track:${id}`) }),
      });
    }
  },

  async likeTrack(token, trackIds) {
    for (const ids of chunk(trackIds, 40)) {
      const uris = ids.map((id) => `spotify:track:${id}`).join(",");
      await api(token, `/me/library?uris=${encodeURIComponent(uris)}`, { method: "PUT" });
    }
  },
};
