import { NextResponse, type NextRequest } from "next/server";
import { getAdapter } from "@/lib/adapters/registry";
import type { MusicAdapter } from "@/lib/adapters/types";
import { isPlatformId, type ApiErrorBody, type PlatformId, type Track } from "@/lib/types";
import { AppError, badRequest, notConfigured } from "./errors";
import { clearToken } from "./session";

export type PlatformContext = { params: Promise<{ platform: string }> };

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    if (err.retryAfter !== undefined) headers["Retry-After"] = String(err.retryAfter);
    return NextResponse.json(
      { error: { code: err.code, message: err.message, retryAfter: err.retryAfter } },
      { status: err.status, headers },
    );
  }
  console.error(err);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Beklenmeyen bir sunucu hatası oluştu." } },
    { status: 500 },
  );
}

/** Route gövdesini sarar: hataları tek tip JSON'a çevirir, POST'larda Origin kontrolü yapar. */
export function route<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      if (req.method !== "GET") assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      // Platform oturumu reddettiyse çerezi sil; arayüz "bağlı değil" gösterip yeniden giriş istesin.
      if (err instanceof AppError && err.code === "NOT_AUTHENTICATED") {
        const params = await (ctx as Partial<PlatformContext> | undefined)?.params;
        if (params && isPlatformId(params.platform)) await clearToken(params.platform).catch(() => undefined);
      }
      return errorResponse(err);
    }
  };
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    throw new AppError("FORBIDDEN", "Farklı kaynaktan gelen istek reddedildi.", 403);
  }
}

export async function resolvePlatform(ctx: PlatformContext): Promise<{ platform: PlatformId; adapter: MusicAdapter }> {
  const { platform } = await ctx.params;
  if (!isPlatformId(platform)) throw new AppError("NOT_FOUND", "Bilinmeyen platform.", 404);
  const adapter = getAdapter(platform);
  if (!adapter.isConfigured()) throw notConfigured(adapter.displayName);
  return { platform, adapter };
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw badRequest("Geçersiz JSON gövdesi.");
  }
}

export function assertIdList(value: unknown, max: number, field = "trackIds"): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw badRequest(`${field} 1 ile ${max} arasında öğe içeren bir dizi olmalı.`);
  }
  for (const id of value) {
    if (typeof id !== "string" || id.length === 0 || id.length > 200) throw badRequest(`${field} geçersiz öğe içeriyor.`);
  }
  return value as string[];
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** İstemciden gelen şarkı nesnesini doğrular ve yalnızca bilinen alanları alır. */
export function sanitizeTrack(value: unknown): Track {
  if (!value || typeof value !== "object") throw badRequest("Geçersiz şarkı nesnesi.");
  const v = value as Record<string, unknown>;
  const title = str(v.title, 500)?.trim();
  if (!title) throw badRequest("Şarkı adı boş olamaz.");
  const artists = Array.isArray(v.artists)
    ? v.artists.filter((a): a is string => typeof a === "string").map((a) => a.slice(0, 200)).slice(0, 20)
    : [];
  const duration = typeof v.durationMs === "number" && Number.isFinite(v.durationMs) ? v.durationMs : undefined;
  const isrc = str(v.isrc, 20)?.toUpperCase();
  return {
    id: str(v.id, 200) ?? title,
    platform: "file",
    title,
    artists,
    album: str(v.album, 500),
    durationMs: duration && duration > 0 ? duration : undefined,
    isrc: isrc && /^[A-Z0-9]{12}$/.test(isrc) ? isrc : undefined,
  };
}
