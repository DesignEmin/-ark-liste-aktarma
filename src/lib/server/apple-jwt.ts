import { importPKCS8, SignJWT } from "jose";
import { env, getAppUrl } from "./config";
import { notConfigured } from "./errors";

// Apple Music "Developer Token": .p8 özel anahtarıyla ES256 imzalı JWT.
// İki çeşit üretiyoruz:
//  - server: sunucudan Apple API'sine giden istekler için (origin kısıtı yok)
//  - client: MusicKit JS için; "origin" talebi sayesinde başka sitede kullanılamaz.
// Token'lar 12 saat geçerli ve bellekte önbelleklenir.

const TTL_SECONDS = 60 * 60 * 12;
const cache: Partial<Record<"server" | "client", { token: string; exp: number }>> = {};

export function isAppleConfigured(): boolean {
  return Boolean(env("APPLE_TEAM_ID") && env("APPLE_KEY_ID") && env("APPLE_PRIVATE_KEY"));
}

function privateKeyPem(): string {
  return env("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

export async function getAppleDeveloperToken(kind: "server" | "client"): Promise<string> {
  if (!isAppleConfigured()) throw notConfigured("Apple Music");
  const now = Math.floor(Date.now() / 1000);
  const cached = cache[kind];
  if (cached && cached.exp - 600 > now) return cached.token;

  const key = await importPKCS8(privateKeyPem(), "ES256");
  const payload: Record<string, unknown> = {};
  if (kind === "client") payload.origin = [getAppUrl()];
  const exp = now + TTL_SECONDS;
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", kid: env("APPLE_KEY_ID") })
    .setIssuer(env("APPLE_TEAM_ID"))
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);
  cache[kind] = { token, exp };
  return token;
}
