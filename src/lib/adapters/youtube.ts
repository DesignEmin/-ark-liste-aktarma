import { env } from "@/lib/server/config";
import { AppError, notConfigured } from "@/lib/server/errors";
import { chunk, Limiter, throwForStatus, upstreamFetch } from "@/lib/server/http";
import { LIKED_ID, type Page, type PlaylistSummary, type Track } from "@/lib/types";
import type { CallbackParams, LoginParams, MusicAdapter, SearchQuery, StoredToken } from "./types";
import { parseIsoDuration, parseVideoTitle } from "./youtube-title";

// YouTube Data API v3. YouTube Music'in herkese açık resmi API'si yoktur; YouTube Music
// kitaplığınız YouTube hesabınızla aynı listeleri ve beğenileri paylaşır.
//
// KOTA (varsayılan 10.000 birim/gün, Pasifik saatiyle gece yarısı sıfırlanır):
//   search.list = 100, playlistItems.insert = 50, videos.rate = 50,
//   playlists.insert = 50, list çağrıları = 1.
// ISRC ile arama yoktur; her şarkı için metin araması gerekir.

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const SCOPE = "https://www.googleapis.com/auth/youtube";
const PLATFORM = "YouTube";
const MUSIC_CATEGORY = "10";

// Aynı listeye paralel ekleme YouTube'da 409/503 hatalarına yol açıyor; tek sıra kullanıyoruz.
const limiter = new Limiter(2, 100);
const writeLimiter = new Limiter(1, 250);

interface YtVideo {
  id: string;
  snippet?: { title: string; channelTitle: string; categoryId?: string };
  contentDetails?: { duration?: string };
}

function secondsUntilPacificMidnight(): number {
  const now = new Date();
  const la = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const next = new Date(la);
  next.setHours(24, 0, 0, 0);
  return Math.max(60, Math.ceil((next.getTime() - la.getTime()) / 1000));
}

async function api<T>(token: StoredToken, path: string, init: RequestInit = {}, write = false): Promise<T> {
  const res = await upstreamFetch(`${API}${path}`, {
    ...init,
    limiter: write ? writeLimiter : limiter,
    platform: PLATFORM,
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 403 || res.status === 429) {
    const body = await res.clone().text();
    if (/quotaExceeded|dailyLimitExceeded/.test(body)) {
      throw new AppError(
        "QUOTA_EXCEEDED",
        "YouTube günlük API kotası doldu. Kota Pasifik saatiyle gece yarısı sıfırlanır; aktarım o zaman kaldığı yerden devam edebilir.",
        429,
        secondsUntilPacificMidnight(),
      );
    }
    if (/rateLimitExceeded|userRateLimitExceeded/.test(body)) {
      throw new AppError("RATE_LIMITED", "YouTube istek hızı sınırı aşıldı.", 429, 10);
    }
  }
  if (!res.ok) await throwForStatus(res, PLATFORM);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await upstreamFetch(TOKEN, {
    limiter,
    platform: PLATFORM,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      ...body,
    }),
  });
  if (!res.ok) await throwForStatus(res, PLATFORM);
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

function videoToTrack(v: YtVideo, fallbackTitle?: string, fallbackChannel?: string): Track | null {
  const rawTitle = v.snippet?.title ?? fallbackTitle ?? "";
  if (!v.id || !rawTitle || rawTitle === "Deleted video" || rawTitle === "Private video") return null;
  const { title, artists } = parseVideoTitle(rawTitle, v.snippet?.channelTitle ?? fallbackChannel ?? "");
  return {
    id: v.id,
    platform: "youtube",
    title,
    artists,
    durationMs: parseIsoDuration(v.contentDetails?.duration),
    url: `https://music.youtube.com/watch?v=${v.id}`,
  };
}

async function videosById(token: StoredToken, ids: string[]): Promise<Map<string, YtVideo>> {
  const map = new Map<string, YtVideo>();
  for (const group of chunk(ids, 50)) {
    const data = await api<{ items: YtVideo[] }>(
      token,
      `/videos?part=snippet,contentDetails&maxResults=50&id=${group.join(",")}`,
    );
    for (const v of data.items) map.set(v.id, v);
  }
  return map;
}

export const youtubeAdapter: MusicAdapter = {
  id: "youtube",
  displayName: "YouTube Music",
  capabilities: {
    isrcSearch: false,
    // Kota hatası bir partinin ortasında gelirse tekrar denemede kopya oluşmasın diye
    // her istekte tek şarkı gönderiyoruz; böylece kaldığı yer kesin olarak bilinir.
    maxAddBatch: 1,
    maxLikeBatch: 1,
    authMode: "oauth-redirect",
    quota: { dailyUnits: 10_000, searchCost: 101, addCost: 50, likeCost: 50 },
  },

  isConfigured: () => Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET")),

  login({ redirectUri, state, codeChallenge }: LoginParams) {
    if (!this.isConfigured()) throw notConfigured(PLATFORM);
    const params = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return { type: "redirect", url: `${AUTH}?${params}` };
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
    const ch = await api<{ items?: { id: string; snippet: { title: string } }[] }>(
      token,
      "/channels?part=snippet&mine=true",
    );
    const channel = ch.items?.[0];
    if (!channel) {
      throw new AppError("FORBIDDEN", "Bu Google hesabına bağlı bir YouTube kanalı yok. Önce YouTube'da kanal oluşturun.", 403);
    }
    return { ...token, userId: channel.id, userName: channel.snippet.title };
  },

  async refresh(token) {
    const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: token.refreshToken ?? "" });
    return { ...token, accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  },

  async getPlaylists(token, cursor) {
    const data = await api<{
      items: { id: string; snippet: { title: string; description?: string; thumbnails?: { medium?: { url: string } } }; contentDetails?: { itemCount: number } }[];
      nextPageToken?: string;
      pageInfo?: { totalResults: number };
    }>(token, `/playlists?part=snippet,contentDetails&mine=true&maxResults=50${cursor ? `&pageToken=${cursor}` : ""}`);

    const items: PlaylistSummary[] = [];
    if (!cursor) {
      const liked = await api<{ pageInfo?: { totalResults: number } }>(
        token,
        "/videos?part=id&myRating=like&maxResults=1",
      );
      items.push({
        id: LIKED_ID,
        name: "Beğenilen Müzikler",
        kind: "liked",
        trackCount: liked.pageInfo?.totalResults,
        warning: "Beğenilen videolardan yalnızca Müzik kategorisindekiler alınır.",
      });
    }
    for (const p of data.items) {
      items.push({
        id: p.id,
        name: p.snippet.title,
        description: p.snippet.description || undefined,
        kind: "playlist",
        trackCount: p.contentDetails?.itemCount,
        imageUrl: p.snippet.thumbnails?.medium?.url,
      });
    }
    return { items, nextCursor: data.nextPageToken ?? null, total: data.pageInfo?.totalResults };
  },

  async getLikedTracks(token, cursor): Promise<Page<Track>> {
    const data = await api<{ items: YtVideo[]; nextPageToken?: string; pageInfo?: { totalResults: number } }>(
      token,
      `/videos?part=snippet,contentDetails&myRating=like&maxResults=50${cursor ? `&pageToken=${cursor}` : ""}`,
    );
    return {
      items: data.items
        .filter((v) => v.snippet?.categoryId === MUSIC_CATEGORY)
        .map((v) => videoToTrack(v))
        .filter((t): t is Track => t !== null),
      nextCursor: data.nextPageToken ?? null,
      total: data.pageInfo?.totalResults,
    };
  },

  async getPlaylistTracks(token, playlistId, cursor) {
    if (playlistId === LIKED_ID) return this.getLikedTracks(token, cursor);
    const data = await api<{
      items: { snippet: { title: string; videoOwnerChannelTitle?: string; resourceId: { videoId: string } } }[];
      nextPageToken?: string;
      pageInfo?: { totalResults: number };
    }>(
      token,
      `/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}${cursor ? `&pageToken=${cursor}` : ""}`,
    );
    const ids = data.items.map((i) => i.snippet.resourceId.videoId).filter(Boolean);
    const videos = await videosById(token, ids);
    const items = data.items
      .map((i) => {
        const id = i.snippet.resourceId.videoId;
        const video = videos.get(id);
        if (!video) return null; // silinmiş ya da gizli video
        return videoToTrack(video, i.snippet.title, i.snippet.videoOwnerChannelTitle);
      })
      .filter((t): t is Track => t !== null);
    return { items, nextCursor: data.nextPageToken ?? null, total: data.pageInfo?.totalResults };
  },

  async searchTrack(token, query: SearchQuery) {
    if (query.kind === "isrc") return []; // YouTube ISRC araması desteklemiyor
    const q = [query.artist, query.title].filter(Boolean).join(" - ");
    const limit = Math.min(query.limit ?? 5, 10);
    const data = await api<{ items: { id: { videoId?: string } }[] }>(
      token,
      `/search?part=id&type=video&videoCategoryId=${MUSIC_CATEGORY}&maxResults=${limit}&q=${encodeURIComponent(q)}`,
    );
    const ids = data.items.map((i) => i.id.videoId).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return [];
    const videos = await videosById(token, ids);
    return ids
      .map((id) => videos.get(id))
      .filter((v): v is YtVideo => Boolean(v))
      .map((v) => videoToTrack(v))
      .filter((t): t is Track => t !== null);
  },

  async createPlaylist(token, name, description) {
    const data = await api<{ id: string }>(
      token,
      "/playlists?part=snippet,status",
      {
        method: "POST",
        body: JSON.stringify({ snippet: { title: name, description: description ?? "" }, status: { privacyStatus: "private" } }),
      },
      true,
    );
    return { id: data.id, url: `https://music.youtube.com/playlist?list=${data.id}` };
  },

  async addTracks(token, playlistId, trackIds) {
    // YouTube toplu ekleme desteklemez: her video için ayrı istek (50 kota birimi).
    for (const videoId of trackIds) {
      await api(
        token,
        "/playlistItems?part=snippet",
        {
          method: "POST",
          body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }),
        },
        true,
      );
    }
  },

  async likeTrack(token, trackIds) {
    for (const id of trackIds) {
      await api(token, `/videos/rate?id=${encodeURIComponent(id)}&rating=like`, { method: "POST" }, true);
    }
  },
};
