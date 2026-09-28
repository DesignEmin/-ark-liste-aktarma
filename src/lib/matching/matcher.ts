import type { MusicAdapter, StoredToken } from "@/lib/adapters/types";
import type { Candidate, MatchResult, MatchStatus, Track } from "@/lib/types";
import { cleanTitle, splitArtists } from "./normalize";
import { scoreCandidate } from "./score";

export const THRESHOLDS = {
  /** Bu puan ve üstü otomatik kabul edilir. */
  matched: 0.85,
  /** Bu puan ile "matched" arası kullanıcıya sorulur; altı "bulunamadı" sayılır. */
  uncertain: 0.55,
} as const;

const MAX_CANDIDATES = 5;

export function statusFor(score: number): MatchStatus {
  if (score >= THRESHOLDS.matched) return "matched";
  if (score >= THRESHOLDS.uncertain) return "uncertain";
  return "notFound";
}

export function rankCandidates(source: Track, found: Array<{ track: Track; via: Candidate["via"] }>): Candidate[] {
  const byId = new Map<string, Candidate>();
  for (const { track, via } of found) {
    const score = scoreCandidate(source, track).total;
    const prev = byId.get(track.id);
    if (!prev || prev.score < score) byId.set(track.id, { track, score, via: prev?.via === "isrc" ? "isrc" : via });
  }
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
}

export function buildResult(candidates: Candidate[]): MatchResult {
  const best = candidates[0];
  const status = best ? statusFor(best.score) : "notFound";
  return {
    status,
    candidates,
    // Emin olunamayanlarda seçim kullanıcıya bırakılır.
    selectedId: status === "matched" ? best.track.id : null,
  };
}

/**
 * Tek bir şarkıyı hedef platformda eşleştirir:
 *  1. ISRC varsa ve platform destekliyorsa ISRC ile ara
 *  2. "sanatçı + temizlenmiş başlık" ile ara
 *  3. Hâlâ zayıfsa yalnızca başlıkla gevşek arama yap
 * Her adımdan sonra yeterince iyi bir sonuç bulunduysa durur (kota tasarrufu).
 */
export async function matchTrack(adapter: MusicAdapter, token: StoredToken, source: Track): Promise<MatchResult> {
  const found: Array<{ track: Track; via: Candidate["via"] }> = [];
  const best = () => rankCandidates(source, found)[0]?.score ?? 0;

  if (source.isrc && adapter.capabilities.isrcSearch) {
    const results = await adapter.searchTrack(token, { kind: "isrc", isrc: source.isrc });
    found.push(...results.map((track) => ({ track, via: "isrc" as const })));
    if (best() >= THRESHOLDS.matched) return buildResult(rankCandidates(source, found));
  }

  const title = cleanTitle(source.title);
  const artist = source.artists.flatMap(splitArtists)[0];

  if (artist) {
    const results = await adapter.searchTrack(token, { kind: "text", title, artist });
    found.push(...results.map((track) => ({ track, via: "search" as const })));
    if (best() >= THRESHOLDS.matched) return buildResult(rankCandidates(source, found));
  }

  // YouTube'da her arama 100 kota birimi: yalnızca hiç makul aday yoksa gevşek arama yap.
  const expensive = Boolean(adapter.capabilities.quota);
  if (!artist || (expensive ? best() < THRESHOLDS.uncertain : true)) {
    const results = await adapter.searchTrack(token, { kind: "text", title });
    found.push(...results.map((track) => ({ track, via: "search" as const })));
  }

  return buildResult(rankCandidates(source, found));
}
