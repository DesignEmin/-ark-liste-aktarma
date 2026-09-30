import { NextResponse } from "next/server";
import { matchTrack } from "@/lib/matching/matcher";
import { AppError, badRequest } from "@/lib/server/errors";
import { readJson, resolvePlatform, route, sanitizeTrack, type PlatformContext } from "@/lib/server/route-helpers";
import { requireToken } from "@/lib/server/session";
import type { ApiErrorBody, MatchResult } from "@/lib/types";

export const maxDuration = 60;

const MAX_BATCH = 25;
const CONCURRENCY = 4;
/** Bu hatalar alındığında partinin geri kalanı denenmez; istemci bekleyip devam eder. */
const FATAL = new Set(["RATE_LIMITED", "QUOTA_EXCEEDED", "NOT_AUTHENTICATED"]);

/**
 * Bir parti kaynak şarkıyı hedef platformda eşleştirir.
 * Yanıt: results[i] = i. şarkının sonucu, ya da null (denenemedi → istemci tekrar dener).
 * Kısmi başarıda o ana kadarki sonuçlar ve hata birlikte döner; hiçbir iş kaybolmaz.
 */
export const POST = route<PlatformContext>(async (req, ctx) => {
  const { platform, adapter } = await resolvePlatform(ctx);
  const body = await readJson<{ tracks?: unknown }>(req);
  if (!Array.isArray(body.tracks) || body.tracks.length === 0 || body.tracks.length > MAX_BATCH) {
    throw badRequest(`tracks 1 ile ${MAX_BATCH} arasında öğe içermeli.`);
  }
  const tracks = body.tracks.map(sanitizeTrack);
  const token = await requireToken(platform);

  const results: Array<MatchResult | null> = new Array(tracks.length).fill(null);
  let fatal: AppError | null = null;
  let lastError: AppError | null = null;
  let next = 0;

  async function worker() {
    while (!fatal && next < tracks.length) {
      const i = next++;
      try {
        results[i] = await matchTrack(adapter, token, tracks[i]);
      } catch (err) {
        if (err instanceof AppError && FATAL.has(err.code)) fatal = err;
        else if (err instanceof AppError) lastError = err;
        else console.error(err);
        // Diğer hatalarda sonuç null kalır; istemci bu şarkıyı daha sonra yeniden dener.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tracks.length) }, worker));

  // TS, worker içindeki atamayı göremediği için tipi açıkça belirtiyoruz.
  // Partideki hiçbir şarkı eşleştirilemediyse sorun büyük olasılıkla sistematiktir
  // (yanlış istek, API kapalı vb.). Sessizce tekrar denemek yerine hatayı göster;
  // aksi halde YouTube'da her deneme boşuna kota harcar.
  const allFailed = results.every((r) => r === null);
  const f = (fatal ?? (allFailed ? lastError : null)) as AppError | null;
  if (f && !fatal) console.error(`[match] ${platform}: ${f.message}`);
  const error: ApiErrorBody["error"] | undefined = f
    ? { code: f.code, message: f.message, retryAfter: f.retryAfter }
    : undefined;
  return NextResponse.json({ results, error });
});
