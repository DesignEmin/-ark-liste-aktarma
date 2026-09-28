import type { Track } from "@/lib/types";
import { normalizedArtists, normalizeText, normalizeTitle, versionTags } from "./normalize";
import { textSimilarity } from "./similarity";

export type TrackLike = Pick<Track, "title" | "artists" | "durationMs" | "isrc">;

export const WEIGHTS = { title: 0.45, artist: 0.35, duration: 0.2 } as const;

/** Bu farkın altındaki süre farkları tam puan alır. */
export const DURATION_TOLERANCE_MS = 3_000;
/** Bu farkın üstündeki süre farkları sıfır puan alır. */
export const DURATION_ZERO_MS = 20_000;

export function durationScore(a?: number, b?: number): number | null {
  if (!a || !b) return null;
  const diff = Math.abs(a - b);
  if (diff <= DURATION_TOLERANCE_MS) return 1;
  if (diff >= DURATION_ZERO_MS) return 0;
  return 1 - (diff - DURATION_TOLERANCE_MS) / (DURATION_ZERO_MS - DURATION_TOLERANCE_MS);
}

export function artistScore(source: TrackLike, candidate: TrackLike): number | null {
  const a = normalizedArtists(source.artists, source.title);
  const b = normalizedArtists(candidate.artists, candidate.title);
  if (a.length === 0 || b.length === 0) return null;
  // Her kaynak sanatçı için adaydaki en benzer sanatçıyı bul; ana sanatçı (ilk) daha önemli.
  let best = 0;
  for (const x of a) for (const y of b) best = Math.max(best, textSimilarity(x, y));
  // Birleşik halleri de dene: "Simon & Garfunkel" vs ["Simon", "Garfunkel"]
  best = Math.max(best, textSimilarity(a.join(" "), b.join(" ")));
  return best;
}

export function titleScore(source: TrackLike, candidate: TrackLike): number {
  const a = normalizeTitle(source.title);
  const b = normalizeTitle(candidate.title);
  let s = textSimilarity(a, b);
  // Normalizasyon bazen fazla kırpar; ham başlıklarla da dene.
  s = Math.max(s, textSimilarity(normalizeText(source.title), normalizeText(candidate.title)));
  return s;
}

/** Canlı/remix/akustik gibi sürüm uyuşmazlıklarında ceza. */
export function versionPenalty(source: TrackLike, candidate: TrackLike): number {
  const a = versionTags(source.title);
  const b = versionTags(candidate.title);
  let diff = 0;
  for (const t of a) if (!b.has(t)) diff++;
  for (const t of b) if (!a.has(t)) diff++;
  return Math.min(0.4, diff * 0.2);
}

export interface ScoreBreakdown {
  total: number;
  title: number;
  artist: number | null;
  duration: number | null;
  penalty: number;
  isrc: boolean;
}

/**
 * Aday şarkıyı 0–1 arasında puanlar.
 * Eksik bileşenlerin (ör. süre bilinmiyor) ağırlığı diğerlerine dağıtılır.
 */
export function scoreCandidate(source: TrackLike, candidate: TrackLike): ScoreBreakdown {
  const title = titleScore(source, candidate);
  const artist = artistScore(source, candidate);
  const duration = durationScore(source.durationMs, candidate.durationMs);
  const penalty = versionPenalty(source, candidate);

  let weighted = WEIGHTS.title * title;
  let weightSum = WEIGHTS.title;
  if (artist !== null) {
    weighted += WEIGHTS.artist * artist;
    weightSum += WEIGHTS.artist;
  }
  if (duration !== null) {
    weighted += WEIGHTS.duration * duration;
    weightSum += WEIGHTS.duration;
  }
  let total = weighted / weightSum - penalty;

  // Sanatçı bilgisi hiç yoksa (ör. düz metin dosyasında yalnızca şarkı adı) güveni düşür.
  if (artist === null) total = Math.min(total, 0.8);

  const isrc = Boolean(source.isrc && candidate.isrc && source.isrc.toUpperCase() === candidate.isrc.toUpperCase());
  if (isrc) {
    // Aynı ISRC = aynı kayıt. Süre çok farklı değilse kesin eşleşme say.
    const farOff = duration !== null && duration === 0;
    total = farOff ? Math.max(total, 0.8) : Math.max(total, 0.98);
  }

  return { total: clamp(total), title, artist, duration, penalty, isrc };
}

const clamp = (n: number) => Math.max(0, Math.min(1, Number(n.toFixed(4))));
