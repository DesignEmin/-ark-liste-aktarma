import type { Page, PlatformId, PlaylistSummary, Track } from "@/lib/types";

/** Şifreli çerezde saklanan platform oturumu. İstemciye asla gönderilmez. */
export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  /** Unix ms. Yoksa süresiz kabul edilir (ör. Deezer offline_access). */
  expiresAt?: number;
  userId?: string;
  userName?: string;
  /** Apple Music: kullanıcının mağaza (ülke) kodu */
  storefront?: string;
}

export type SearchQuery =
  | { kind: "isrc"; isrc: string }
  | { kind: "text"; title: string; artist?: string; limit?: number };

export interface AdapterCapabilities {
  /** ISRC ile doğrudan arama yapılabiliyor mu? */
  isrcSearch: boolean;
  /** addTracks tek istekte en fazla kaç şarkı alır */
  maxAddBatch: number;
  /** likeTrack tek istekte en fazla kaç şarkı alır */
  maxLikeBatch: number;
  /** Giriş yöntemi */
  authMode: "oauth-redirect" | "musickit";
  /** Hedef olarak kullanıldığında tahmini kota maliyeti (YouTube için) */
  quota?: { dailyUnits: number; searchCost: number; addCost: number; likeCost: number };
}

export type LoginStart =
  | { type: "redirect"; url: string }
  | { type: "musickit" };

export interface LoginParams {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

export interface CallbackParams {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

/**
 * Her platformun uyguladığı ortak arayüz.
 * Yeni bir platform eklemek için bu arayüzü uygulayıp registry.ts'e kaydetmek yeterli.
 */
export interface MusicAdapter {
  id: PlatformId;
  displayName: string;
  capabilities: AdapterCapabilities;

  /** Gerekli ortam değişkenleri tanımlı mı? */
  isConfigured(): boolean;

  /** Giriş akışını başlatır: yönlendirilecek URL'i ya da MusicKit bilgisini döndürür. */
  login(params: LoginParams): LoginStart;
  /** OAuth geri dönüşünde kodu token'a çevirir. */
  handleCallback?(params: CallbackParams): Promise<StoredToken>;
  /** Süresi dolan erişim token'ını yeniler. */
  refresh?(token: StoredToken): Promise<StoredToken>;

  getPlaylists(token: StoredToken, cursor?: string | null): Promise<Page<PlaylistSummary>>;
  getLikedTracks(token: StoredToken, cursor?: string | null): Promise<Page<Track>>;
  getPlaylistTracks(token: StoredToken, playlistId: string, cursor?: string | null): Promise<Page<Track>>;

  searchTrack(token: StoredToken, query: SearchQuery): Promise<Track[]>;

  createPlaylist(token: StoredToken, name: string, description?: string): Promise<{ id: string; url?: string }>;
  addTracks(token: StoredToken, playlistId: string, trackIds: string[]): Promise<void>;
  likeTrack(token: StoredToken, trackIds: string[]): Promise<void>;
}
