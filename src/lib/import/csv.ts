import Papa from "papaparse";
import { foldText } from "@/lib/matching/normalize";
import type { Track } from "@/lib/types";
import { dedupe, makeTrack, nameFromFile } from "./common";
import type { ImportedCollection, ImportResult } from "./types";

// Desteklenen CSV biçimleri:
//  - Exportify (exportify.net): "Track Name", "Artist Name(s)", "Album Name", "Duration (ms)", (eski sürümlerde "ISRC")
//  - TuneMyMusic: "Track name", "Artist name", "Album", "Playlist name", "Type", "ISRC"
//  - Genel: başlıklar aşağıdaki eş anlamlılardan biriyse (Türkçe başlıklar dahil) çalışır.

const HEADER_ALIASES = {
  title: ["track name", "track", "title", "song", "song name", "name", "sarki", "sarki adi", "parca", "baslik"],
  artist: ["artist name(s)", "artist name", "artist", "artists", "sanatci", "sanatcilar", "artist(s)"],
  album: ["album name", "album", "album title", "albüm", "album adi"],
  isrc: ["isrc"],
  duration: ["duration (ms)", "track duration (ms)", "duration_ms", "duration", "sure", "length"],
  playlist: ["playlist name", "playlist", "liste", "liste adi"],
  type: ["type"],
} as const;

type Field = keyof typeof HEADER_ALIASES;

function headerKey(h: string) {
  return foldText(h).trim();
}

function mapHeaders(headers: string[]): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    const aliases = HEADER_ALIASES[field].map(headerKey);
    const found = headers.find((h) => aliases.includes(headerKey(h)));
    if (found) out[field] = found;
  }
  return out;
}

/** "3:45", "225", "225000" gibi değerleri milisaniyeye çevirir. */
export function parseDuration(value: string | undefined, header?: string): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  const clock = v.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) return ((Number(clock[1] ?? 0) * 60 + Number(clock[2])) * 60 + Number(clock[3])) * 1000;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (header && /ms/i.test(header)) return n;
  return n > 10_000 ? n : n * 1000; // büyük sayılar zaten ms
}

export function detectCsvFormat(headers: string[]): "exportify" | "tunemymusic" | "csv" {
  const keys = headers.map(headerKey);
  if (keys.includes("artist name(s)") || keys.includes("track uri")) return "exportify";
  if (keys.includes("playlist name") && keys.includes("track name") && keys.includes("artist name")) return "tunemymusic";
  return "csv";
}

export function parseCsv(text: string, fileName: string): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const map = mapHeaders(headers);
  if (!map.title) {
    throw new Error("CSV dosyasında şarkı adı sütunu bulunamadı (ör. 'Track Name', 'Title', 'Şarkı').");
  }
  const format = detectCsvFormat(headers);
  const warnings: string[] = [];
  let skipped = 0;

  const groups = new Map<string, { kind: ImportedCollection["kind"]; tracks: Track[] }>();
  const defaultName = nameFromFile(fileName);

  for (const row of parsed.data) {
    const track = makeTrack({
      title: row[map.title],
      // Exportify sanatçıları virgülle ayırır; makeTrack splitArtists ile böler.
      artist: map.artist ? row[map.artist] : undefined,
      album: map.album ? row[map.album] : undefined,
      isrc: map.isrc ? row[map.isrc] : undefined,
      durationMs: map.duration ? parseDuration(row[map.duration], map.duration) : undefined,
    });
    if (!track) {
      skipped++;
      continue;
    }
    const type = map.type ? foldText(row[map.type] ?? "") : "";
    const liked = /favorite|liked|begen|loved/.test(type);
    const name = (map.playlist && row[map.playlist]?.trim()) || (liked ? "Beğenilen Şarkılar" : defaultName);
    const key = `${liked ? "liked" : "playlist"}:${name}`;
    if (!groups.has(key)) groups.set(key, { kind: liked ? "liked" : "playlist", tracks: [] });
    groups.get(key)!.tracks.push(track);
  }

  if (skipped) warnings.push(`${skipped} satır şarkı adı olmadığı için atlandı.`);
  if (parsed.errors.length) warnings.push(`${parsed.errors.length} satır CSV biçim hatası içeriyordu.`);

  const collections = [...groups.entries()].map(([key, g]) => ({
    name: key.slice(key.indexOf(":") + 1),
    kind: g.kind,
    tracks: dedupe(g.tracks),
  }));
  return { format, collections, warnings };
}
