// Uygulama genelinde paylaşılan veri modelleri. Hem sunucu hem istemci kullanır.

export const PLATFORM_IDS = ["spotify", "youtube", "apple", "deezer"] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

/** Şarkının nereden geldiği: bir platform ya da içe aktarılan dosya. */
export type SourceKind = PlatformId | "file";

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === "string" && (PLATFORM_IDS as readonly string[]).includes(value);
}

/** "Beğenilen şarkılar" koleksiyonu için sabit kimlik. */
export const LIKED_ID = "__liked__";

export interface Track {
  /** Platformdaki kimlik (dosyadan gelen şarkılarda üretilmiş anahtar). */
  id: string;
  platform: SourceKind;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
  url?: string;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  description?: string;
  trackCount?: number;
  kind: "playlist" | "liked";
  imageUrl?: string;
  owner?: string;
  /** Liste okunurken sorun çıkabilecekse kullanıcıya gösterilecek uyarı. */
  warning?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

/** Eşleştirme sonuçları */
export type MatchStatus = "matched" | "uncertain" | "notFound";

export interface Candidate {
  track: Track;
  score: number;
  via: "isrc" | "search";
}

export interface MatchResult {
  status: MatchStatus;
  candidates: Candidate[];
  /** Hedefte kullanılacak şarkının kimliği. null = atla. */
  selectedId: string | null;
  /** Kullanıcı seçimi elle mi yaptı? */
  manual?: boolean;
}

/** API route'larının döndürdüğü hata biçimi */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    retryAfter?: number;
  };
}

export type ApiErrorCode =
  | "NOT_AUTHENTICATED"
  | "NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UPSTREAM_ERROR"
  | "INTERNAL";
