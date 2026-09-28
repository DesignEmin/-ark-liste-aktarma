import type { ApiErrorCode } from "@/lib/types";

/** Sunucuda fırlatılan, istemciye güvenle iletilebilen hata. */
export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notAuthenticated = (platform: string) =>
  new AppError("NOT_AUTHENTICATED", `${platform} hesabına giriş yapılmamış veya oturum süresi dolmuş.`, 401);

export const notConfigured = (platform: string) =>
  new AppError(
    "NOT_CONFIGURED",
    `${platform} için API anahtarları sunucuda tanımlı değil. README'deki kurulum adımlarına bakın.`,
    503,
  );

export const badRequest = (message: string) => new AppError("BAD_REQUEST", message, 400);
