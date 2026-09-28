import type { PlatformId } from "@/lib/types";

/** Uygulamanın dışarıdan görünen adresi. OAuth redirect URI'leri buna göre oluşur. */
export function getAppUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://127.0.0.1:3000";
}

export function redirectUriFor(platform: PlatformId): string {
  return `${getAppUrl()}/api/auth/${platform}/callback`;
}

export function isSecureOrigin(): boolean {
  return getAppUrl().startsWith("https://");
}

export function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}
