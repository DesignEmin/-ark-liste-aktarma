import { normalizeText, splitArtists } from "@/lib/matching/normalize";
import type { Track } from "@/lib/types";

/** Dosyadan gelen şarkı için kararlı bir kimlik üretir (aynı şarkı iki kez eklenmesin). */
export function fileTrackId(title: string, artists: string[]): string {
  return `file:${normalizeText(artists.join(" "))}|${normalizeText(title)}`;
}

export function makeTrack(input: {
  title?: string | null;
  artist?: string | null;
  artists?: string[];
  album?: string | null;
  durationMs?: number | null;
  isrc?: string | null;
}): Track | null {
  const title = input.title?.trim();
  if (!title) return null;
  const artists = (input.artists ?? (input.artist ? splitArtists(input.artist) : [])).map((a) => a.trim()).filter(Boolean);
  const isrc = input.isrc?.trim().toUpperCase().replace(/-/g, "");
  const duration = input.durationMs && Number.isFinite(input.durationMs) && input.durationMs > 0 ? input.durationMs : undefined;
  return {
    id: fileTrackId(title, artists),
    platform: "file",
    title,
    artists,
    album: input.album?.trim() || undefined,
    durationMs: duration,
    isrc: isrc && /^[A-Z0-9]{12}$/.test(isrc) ? isrc : undefined,
  };
}

/** Aynı kimliğe sahip şarkıları tekilleştirir, sırayı korur. */
export function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Dosya adından liste adı: "Yaz Şarkıları.csv" → "Yaz Şarkıları" */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "İçe aktarılan liste";
}
