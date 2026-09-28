"use client";

import type { AdapterCapabilities } from "@/lib/adapters/types";
import { isPlatformId, type MatchResult, type PlatformId, type Track } from "@/lib/types";
import { api, ClientApiError } from "./api";
import { planFor, selectedCollections, selectedTrackKeys, type TransferJob } from "./job";
import { getCachedMatches, putCachedMatches, saveJob } from "./job-store";

// Aktarımı küçük, tekrar edilebilir adımlara bölen yönetici.
// Her adımın sonucu hemen IndexedDB'ye yazılır. Sekme kapanır, ağ kopar ya da
// kota dolarsa aynı fonksiyon tekrar çağrıldığında kaldığı yerden devam eder.

export type StopReason = "aborted" | "quota" | "auth" | "error";

export class StopError extends Error {
  constructor(
    public readonly reason: StopReason,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "StopError";
  }
}

export interface RunCallbacks {
  signal: AbortSignal;
  onUpdate: (job: TransferJob) => void;
  /** Hız sınırı nedeniyle beklenirken her saniye çağrılır (0 = bekleme bitti). */
  onWait?: (secondsLeft: number) => void;
}

const MAX_MATCH_ATTEMPTS = 3;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new StopError("aborted", "Duraklatıldı."));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new StopError("aborted", "Duraklatıldı."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function countdown(seconds: number, cb: RunCallbacks) {
  for (let left = Math.max(1, Math.ceil(seconds)); left > 0; left--) {
    cb.onWait?.(left);
    await sleep(1000, cb.signal);
  }
  cb.onWait?.(0);
}

/** API çağrısını geçici hatalarda (429, ağ, 5xx) bekleyip yeniden dener. */
async function withRetries<T>(fn: () => Promise<T>, cb: RunCallbacks): Promise<T> {
  let transient = 0;
  let rate = 0;
  for (;;) {
    if (cb.signal.aborted) throw new StopError("aborted", "Duraklatıldı.");
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof ClientApiError)) throw err;
      if (err.code === "RATE_LIMITED" && rate++ < 30) {
        await countdown(err.retryAfter ?? 5, cb);
        continue;
      }
      if ((err.code === "NETWORK" || err.code === "UPSTREAM_ERROR" || err.status >= 500) && transient < 4) {
        await sleep(1000 * 2 ** transient++, cb.signal);
        continue;
      }
      throw toStop(err);
    }
  }
}

function toStop(err: ClientApiError): StopError {
  if (err.code === "QUOTA_EXCEEDED") return new StopError("quota", err.message, err.retryAfter);
  if (err.code === "NOT_AUTHENTICATED") return new StopError("auth", err.message);
  return new StopError("error", err.message);
}

async function persist(job: TransferJob, cb: RunCallbacks) {
  await saveJob(job);
  cb.onUpdate({ ...job });
}

/** 1) Seçili listelerin şarkılarını kaynaktan sayfa sayfa okur. */
export async function loadSourceTracks(job: TransferJob, cb: RunCallbacks) {
  const source = job.source;
  if (!isPlatformId(source)) return; // dosyadan gelen şarkılar zaten yüklü
  for (const c of selectedCollections(job)) {
    while (!c.loaded) {
      try {
        const page = await withRetries(() => api.tracks(source, c.sourceId, c.loadCursor), cb);
        for (const t of page.items) {
          job.tracks[t.id] = t;
          c.trackKeys.push(t.id);
        }
        c.loadCursor = page.nextCursor;
        c.loaded = !page.nextCursor;
      } catch (err) {
        if (err instanceof StopError && err.reason === "error") {
          // Ör. Spotify geliştirici modunda başkasına ait liste: bu listeyi atla, diğerlerine devam et.
          c.loadError = err.message;
          c.loaded = true;
        } else throw err;
      }
      await persist(job, cb);
    }
  }
}

const cacheKeyOf = (job: TransferJob, key: string) => `${job.source}:${key}`;

/** 2) Eşleşmemiş şarkıları hedefte arar. */
export async function runMatching(job: TransferJob, caps: AdapterCapabilities, cb: RunCallbacks) {
  const target = job.target as PlatformId;

  // Önbellekten doldur (aynı şarkı daha önce eşleştirildiyse tekrar arama yapma).
  const pendingAtStart = selectedTrackKeys(job).filter((k) => !job.matches[k]);
  const cached = await getCachedMatches(target, pendingAtStart.map((k) => cacheKeyOf(job, k)));
  for (const k of pendingAtStart) {
    const hit = cached.get(cacheKeyOf(job, k));
    if (hit) job.matches[k] = hit;
  }
  if (cached.size) await persist(job, cb);

  const batchSize = caps.quota ? 5 : 20;
  const parallel = caps.quota ? 1 : 2;

  for (;;) {
    const pending = selectedTrackKeys(job).filter((k) => !job.matches[k]);
    if (pending.length === 0) break;

    const batches: string[][] = [];
    for (let i = 0; i < pending.length; i += batchSize) batches.push(pending.slice(i, i + batchSize));

    let cursor = 0;
    const worker = async () => {
      while (cursor < batches.length) {
        const keys = batches[cursor++];
        await matchBatch(job, target, keys, cb);
      }
    };
    await Promise.all(Array.from({ length: Math.min(parallel, batches.length) }, worker));
  }
}

async function matchBatch(job: TransferJob, target: PlatformId, keys: string[], cb: RunCallbacks) {
  const tracks: Track[] = keys.map((k) => job.tracks[k]);
  const res = await withRetries(() => api.match(target, tracks), cb);

  const toCache: Array<[string, MatchResult]> = [];
  res.results.forEach((r, i) => {
    const key = keys[i];
    if (r) {
      job.matches[key] = r;
      if (r.status === "matched") toCache.push([cacheKeyOf(job, key), r]);
    } else if (!res.error) {
      // Şarkıya özgü geçici hata: birkaç denemeden sonra "bulunamadı" say.
      const attempts = (job.matchAttempts[key] ?? 0) + 1;
      job.matchAttempts[key] = attempts;
      if (attempts >= MAX_MATCH_ATTEMPTS) job.matches[key] = { status: "notFound", candidates: [], selectedId: null };
    }
  });
  if (toCache.length) await putCachedMatches(target, toCache);
  await persist(job, cb);

  if (res.error) {
    if (res.error.code === "RATE_LIMITED") await countdown(res.error.retryAfter ?? 5, cb);
    else throw toStop(new ClientApiError(res.error.code, res.error.message, 429, res.error.retryAfter));
  }
}

/** Kullanıcı bir adayı seçtiğinde (ya da atladığında, selectedId = null) çağrılır. */
export function applyChoice(job: TransferJob, key: string, selectedId: string | null) {
  const m = job.matches[key];
  if (m) job.matches[key] = { ...m, selectedId, manual: true };
}

/** Elle yapılan seçimi önbelleğe yazar; aynı şarkı başka bir aktarımda tekrar sorulmaz. */
export async function rememberChoice(job: TransferJob, key: string) {
  const m = job.matches[key];
  if (job.target && m?.selectedId) await putCachedMatches(job.target, [[cacheKeyOf(job, key), m]]);
}

/** 3) Listeleri oluşturur, şarkıları partiler halinde ekler, beğenileri aktarır. */
export async function runTransfer(job: TransferJob, caps: AdapterCapabilities, cb: RunCallbacks) {
  const target = job.target as PlatformId;
  job.phase = "transfer";

  for (const c of selectedCollections(job)) {
    if (c.done) continue;
    if (!c.plan) {
      // Plan bir kez dondurulur; devam ederken aynı sıra kullanılır ve kopya oluşmaz.
      c.plan = planFor(job, c);
      c.progress = 0;
      await persist(job, cb);
    }
    const plan = c.plan;

    if (c.kind === "liked") {
      while (c.progress < plan.length) {
        const batch = plan.slice(c.progress, c.progress + caps.maxLikeBatch);
        await withRetries(() => api.like(target, batch), cb);
        c.progress += batch.length;
        await persist(job, cb);
      }
    } else if (plan.length > 0) {
      if (!c.targetPlaylistId) {
        const created = await withRetries(
          () => api.createPlaylist(target, c.name, "Müzik Listesi Aktarıcı ile aktarıldı."),
          cb,
        );
        c.targetPlaylistId = created.id;
        c.targetUrl = created.url;
        await persist(job, cb);
      }
      const playlistId = c.targetPlaylistId;
      while (c.progress < plan.length) {
        const batch = plan.slice(c.progress, c.progress + caps.maxAddBatch);
        await withRetries(() => api.addTracks(target, playlistId, batch), cb);
        c.progress += batch.length;
        await persist(job, cb);
      }
    }
    c.done = true;
    await persist(job, cb);
  }

  job.phase = "done";
  job.finishedAt = Date.now();
  await persist(job, cb);
}

/** YouTube için tahmini kota kullanımı (birim). */
export function estimateQuota(job: TransferJob, caps: AdapterCapabilities) {
  if (!caps.quota) return null;
  const q = caps.quota;
  const keys = selectedTrackKeys(job);
  const pending = keys.filter((k) => !job.matches[k]).length || keys.length;
  const cols = selectedCollections(job);
  const likes = cols.filter((c) => c.kind === "liked").reduce((n, c) => n + (c.trackCount ?? c.trackKeys.length), 0);
  const adds = cols.filter((c) => c.kind === "playlist").reduce((n, c) => n + (c.trackCount ?? c.trackKeys.length), 0);
  const playlists = cols.filter((c) => c.kind === "playlist").length;
  const matching = pending * q.searchCost;
  const transfer = adds * q.addCost + likes * q.likeCost + playlists * 50;
  return { matching, transfer, total: matching + transfer, daily: q.dailyUnits };
}
