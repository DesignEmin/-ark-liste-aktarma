import type { Track } from "@/lib/types";
import { dedupe, makeTrack } from "./common";
import type { ImportedCollection, ImportResult } from "./types";

// Spotify "Hesap verilerini indir" (Gizlilik ayarları) arşivindeki dosyalar:
//  - YourLibrary.json      → { tracks: [{ artist, album, track, uri }] }        (beğenilen şarkılar)
//  - Playlist1.json vb.    → { playlists: [{ name, items: [{ track: { trackName, artistName, albumName } }] }] }
//  - StreamingHistory*.json / Streaming_History_Audio_*.json (dinleme geçmişi; tekil şarkılara indirgenir)

interface LibraryJson {
  tracks?: { artist?: string; album?: string; track?: string; uri?: string }[];
}

interface PlaylistsJson {
  playlists?: {
    name?: string;
    items?: { track?: { trackName?: string; artistName?: string; albumName?: string } | null }[];
  }[];
}

type HistoryEntry = {
  // Hesap verileri (basit)
  artistName?: string;
  trackName?: string;
  msPlayed?: number;
  // Genişletilmiş dinleme geçmişi
  master_metadata_track_name?: string | null;
  master_metadata_album_artist_name?: string | null;
  master_metadata_album_album_name?: string | null;
  ms_played?: number;
};

const MIN_PLAY_MS = 30_000;

export function parseSpotifyJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON dosyası okunamadı.");
  }

  if (data && typeof data === "object" && Array.isArray((data as PlaylistsJson).playlists)) {
    const collections: ImportedCollection[] = [];
    for (const p of (data as PlaylistsJson).playlists ?? []) {
      const tracks = (p.items ?? [])
        .map((i) => i.track && makeTrack({ title: i.track.trackName, artist: i.track.artistName, album: i.track.albumName }))
        .filter((t): t is Track => Boolean(t));
      if (tracks.length) collections.push({ name: p.name?.trim() || "Adsız liste", kind: "playlist", tracks: dedupe(tracks) });
    }
    return { format: "spotify-playlists", collections, warnings: [] };
  }

  if (data && typeof data === "object" && Array.isArray((data as LibraryJson).tracks)) {
    const tracks = ((data as LibraryJson).tracks ?? [])
      .map((t) => makeTrack({ title: t.track, artist: t.artist, album: t.album }))
      .filter((t): t is Track => Boolean(t));
    return {
      format: "spotify-library",
      collections: [{ name: "Beğenilen Şarkılar", kind: "liked", tracks: dedupe(tracks) }],
      warnings: [],
    };
  }

  if (Array.isArray(data)) {
    const counts = new Map<string, { track: Track; plays: number }>();
    for (const e of data as HistoryEntry[]) {
      const title = e.trackName ?? e.master_metadata_track_name;
      const artist = e.artistName ?? e.master_metadata_album_artist_name;
      const played = e.msPlayed ?? e.ms_played ?? 0;
      if (!title || played < MIN_PLAY_MS) continue;
      const track = makeTrack({ title, artist, album: e.master_metadata_album_album_name });
      if (!track) continue;
      const entry = counts.get(track.id);
      if (entry) entry.plays++;
      else counts.set(track.id, { track, plays: 1 });
    }
    // En çok dinlenenden aza doğru
    const tracks = [...counts.values()].sort((a, b) => b.plays - a.plays).map((c) => c.track);
    return {
      format: "spotify-history",
      collections: [{ name: "Dinleme Geçmişi", kind: "playlist", tracks }],
      warnings: ["Dinleme geçmişinden 30 saniyeden uzun dinlenen şarkılar alındı (en çok dinlenenden aza)."],
    };
  }

  throw new Error("Tanınmayan JSON biçimi. YourLibrary.json, Playlist1.json veya StreamingHistory dosyası yükleyin.");
}
