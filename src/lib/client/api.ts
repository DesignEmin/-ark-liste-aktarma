"use client";

import type { PlatformStatus } from "@/lib/platform-status";
import type { ApiErrorBody, ApiErrorCode, MatchResult, Page, PlatformId, PlaylistSummary, Track } from "@/lib/types";

export class ClientApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode | "NETWORK",
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ClientApiError("NETWORK", "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.", 0);
  }
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* JSON değil */
    }
    const retryHeader = Number(res.headers.get("retry-after"));
    throw new ClientApiError(
      body?.error.code ?? (res.status === 429 ? "RATE_LIMITED" : "INTERNAL"),
      body?.error.message ?? `İstek başarısız oldu (${res.status}).`,
      res.status,
      body?.error.retryAfter ?? (Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined),
    );
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const qs = (params: Record<string, string | null | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) s.set(k, v);
  return s.toString();
};

export const api = {
  status: () => request<{ platforms: PlatformStatus[] }>("/api/auth/status"),
  logout: (p: PlatformId) => post<{ ok: true }>(`/api/auth/${p}/logout`, {}),
  loginUrl: (p: PlatformId, returnTo: string) => `/api/auth/${p}/login?${qs({ returnTo })}`,
  appleDeveloperToken: () => request<{ token: string }>("/api/auth/apple/developer-token"),
  appleUserToken: (musicUserToken: string) => post<{ ok: true }>("/api/auth/apple/user-token", { musicUserToken }),

  playlists: (p: PlatformId, cursor?: string | null) =>
    request<Page<PlaylistSummary>>(`/api/${p}/playlists?${qs({ cursor })}`),
  tracks: (p: PlatformId, playlistId: string, cursor?: string | null) =>
    request<Page<Track>>(`/api/${p}/tracks?${qs({ playlistId, cursor })}`),
  match: (p: PlatformId, tracks: Track[]) =>
    post<{ results: Array<MatchResult | null>; error?: ApiErrorBody["error"] }>(`/api/${p}/match`, { tracks }),
  createPlaylist: (p: PlatformId, name: string, description?: string) =>
    post<{ id: string; url?: string }>(`/api/${p}/playlist`, { name, description }),
  addTracks: (p: PlatformId, playlistId: string, trackIds: string[]) =>
    post<{ added: number }>(`/api/${p}/add`, { playlistId, trackIds }),
  like: (p: PlatformId, trackIds: string[]) => post<{ liked: number }>(`/api/${p}/like`, { trackIds }),
};
