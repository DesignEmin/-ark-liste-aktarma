import type { Track } from "@/lib/types";

export interface ImportedCollection {
  name: string;
  kind: "playlist" | "liked";
  tracks: Track[];
}

export type ImportFormat =
  | "exportify"
  | "tunemymusic"
  | "csv"
  | "text"
  | "spotify-library"
  | "spotify-playlists"
  | "spotify-history";

export interface ImportResult {
  format: ImportFormat;
  collections: ImportedCollection[];
  /** Okunamayan satır sayısı vb. */
  warnings: string[];
}
