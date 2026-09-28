import { stripBom } from "./common";
import { parseCsv } from "./csv";
import { parseSpotifyJson } from "./spotify-json";
import { parseText } from "./text";
import type { ImportResult } from "./types";

export type { ImportedCollection, ImportFormat, ImportResult } from "./types";

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** Dosya uzantısına ve içeriğe göre uygun ayrıştırıcıyı seçer. Tamamen tarayıcıda çalışır. */
export function parseImportFile(fileName: string, rawText: string): ImportResult {
  const text = stripBom(rawText);
  const lower = fileName.toLowerCase();
  const trimmed = text.trimStart();

  if (lower.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseSpotifyJson(text);
  }
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || looksLikeCsv(text)) {
    return parseCsv(text, fileName);
  }
  return parseText(text, fileName);
}

function looksLikeCsv(text: string): boolean {
  const first = text.split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  return first.includes(",") && /(track|title|artist|şarkı|sanatçı)/.test(first);
}
