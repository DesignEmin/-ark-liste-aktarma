import type { PlatformId } from "@/lib/types";
import { appleAdapter } from "./apple";
import { deezerAdapter } from "./deezer";
import { spotifyAdapter } from "./spotify";
import type { MusicAdapter } from "./types";
import { youtubeAdapter } from "./youtube";

// Yeni bir platform eklemek için: MusicAdapter'ı uygulayan dosyayı yazın,
// PlatformId listesine (lib/types.ts) ekleyin ve burada kaydedin.
const adapters: Record<PlatformId, MusicAdapter> = {
  spotify: spotifyAdapter,
  youtube: youtubeAdapter,
  apple: appleAdapter,
  deezer: deezerAdapter,
};

export function getAdapter(id: PlatformId): MusicAdapter {
  return adapters[id];
}

export function allAdapters(): MusicAdapter[] {
  return Object.values(adapters);
}
