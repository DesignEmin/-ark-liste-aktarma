import type { Track } from "@/lib/types";
import { dedupe, makeTrack, nameFromFile } from "./common";
import type { ImportResult } from "./types";

// Düz metin: her satırda bir şarkı.
//   Sanatçı - Şarkı
//   1. Sanatçı – Şarkı (3:45)
//   Sanatçı<TAB>Şarkı
// "#" ile başlayan satırlar yorum sayılır. Tire yoksa satırın tamamı şarkı adıdır.

export function parseLine(raw: string): { artist?: string; title: string; durationMs?: number } | null {
  let line = raw.trim();
  if (!line || line.startsWith("#") || line.startsWith("//")) return null;
  line = line.replace(/^\d+\s*[.)-]\s+/, ""); // "1. " / "01) " numaralandırma

  let durationMs: number | undefined;
  const dur = line.match(/\s*[([]?(\d{1,2}):(\d{2})[)\]]?\s*$/);
  if (dur) {
    durationMs = (Number(dur[1]) * 60 + Number(dur[2])) * 1000;
    line = line.slice(0, dur.index).trim();
  }

  const tab = line.split("\t").map((s) => s.trim()).filter(Boolean);
  if (tab.length >= 2) return { artist: tab[0], title: tab[1], durationMs };

  const m = line.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim(), durationMs };
  return line ? { title: line, durationMs } : null;
}

export function parseText(text: string, fileName: string): ImportResult {
  const tracks: Track[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parseLine(line);
    const track = parsed ? makeTrack(parsed) : null;
    if (track) tracks.push(track);
    else if (parsed !== null) skipped++;
  }
  return {
    format: "text",
    collections: [{ name: nameFromFile(fileName), kind: "playlist", tracks: dedupe(tracks) }],
    warnings: skipped ? [`${skipped} satır okunamadı.`] : [],
  };
}
