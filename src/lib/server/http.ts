import { AppError } from "./errors";

// Platform API'lerine giden tüm istekler buradan geçer:
//  - Limiter: aynı anda en fazla N istek + istekler arası asgari aralık (kuyruk).
//  - 429: Retry-After başlığına göre bekler, tüm kuyruğu da o süre boyunca durdurur.
//  - 5xx / ağ hatası: üstel geri çekilme ile yeniden dener.
//  - Bekleme süresi serverless fonksiyon süresini aşacak kadar uzunsa istemciye
//    RATE_LIMITED + retryAfter döner; istemci bekleyip aynı parçayı tekrar ister.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Limiter {
  private active = 0;
  private waiting: Array<() => void> = [];
  private nextSlotAt = 0;
  private pausedUntil = 0;

  constructor(
    private readonly maxConcurrent: number,
    private readonly minIntervalMs: number,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** 429 alındığında tüm kuyruğu belirtilen süre boyunca durdurur. */
  pause(ms: number) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }

  private async acquire() {
    if (this.active < this.maxConcurrent) {
      this.active++;
    } else {
      // Slot, release() tarafından doğrudan bu bekleyene devredilir.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    const now = Date.now();
    const startAt = Math.max(now, this.nextSlotAt, this.pausedUntil);
    this.nextSlotAt = startAt + this.minIntervalMs;
    if (startAt > now) await sleep(startAt - now);
  }

  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
}

export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export interface UpstreamOptions extends RequestInit {
  limiter: Limiter;
  platform: string;
  maxRetries?: number;
  /** Bu süreden uzun beklemeler istemciye devredilir. */
  maxInlineWaitMs?: number;
}

export async function upstreamFetch(url: string, options: UpstreamOptions): Promise<Response> {
  const { limiter, platform, maxRetries = 4, maxInlineWaitMs = 20_000, ...init } = options;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await limiter.run(() => fetch(url, { ...init, cache: "no-store" }));
    } catch (err) {
      if (attempt >= maxRetries) {
        throw new AppError("UPSTREAM_ERROR", `${platform} sunucusuna ulaşılamadı: ${(err as Error).message}`, 502);
      }
      await sleep(backoff(attempt));
      continue;
    }

    if (res.status === 429) {
      const wait = parseRetryAfter(res.headers.get("retry-after")) ?? backoff(attempt);
      limiter.pause(wait);
      if (wait > maxInlineWaitMs || attempt >= maxRetries) {
        throw new AppError(
          "RATE_LIMITED",
          `${platform} istek sınırına ulaşıldı. ${Math.ceil(wait / 1000)} sn sonra otomatik devam edilecek.`,
          429,
          Math.ceil(wait / 1000),
        );
      }
      await sleep(wait);
      continue;
    }

    if (res.status >= 500 && attempt < maxRetries) {
      await sleep(backoff(attempt));
      continue;
    }

    return res;
  }
}

function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 16_000) + Math.floor(Math.random() * 250);
}

/** Başarısız yanıtı uygun AppError'a çevirir. */
export async function throwForStatus(res: Response, platform: string): Promise<never> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    /* yok say */
  }
  if (res.status === 401) {
    throw new AppError("NOT_AUTHENTICATED", `${platform} oturumu geçersiz. Lütfen tekrar giriş yapın.`, 401);
  }
  if (res.status === 403) {
    throw new AppError("FORBIDDEN", `${platform} bu işleme izin vermedi. ${detail}`, 403);
  }
  if (res.status === 404) {
    throw new AppError("NOT_FOUND", `${platform}: kaynak bulunamadı.`, 404);
  }
  throw new AppError("UPSTREAM_ERROR", `${platform} hata döndürdü (${res.status}). ${detail}`, 502);
}

export async function fetchJson<T>(url: string, options: UpstreamOptions): Promise<T> {
  const res = await upstreamFetch(url, options);
  if (!res.ok) await throwForStatus(res, options.platform);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
