import { cookies } from "next/headers";
import type { PlatformId } from "@/lib/types";
import { isSecureOrigin } from "./config";
import { decrypt, encrypt, randomToken, sha256Base64Url } from "./crypto";
import { badRequest } from "./errors";

// OAuth "state" (CSRF koruması) ve PKCE doğrulayıcısı kısa ömürlü şifreli bir
// çerezde tutulur; geri dönüşte doğrulanıp silinir.

interface PendingOAuth {
  state: string;
  verifier: string;
  returnTo: string;
  createdAt: number;
}

const MAX_AGE_SECONDS = 600;
const cookieName = (platform: PlatformId) => `mla_oauth_${platform}`;

export async function beginOAuth(platform: PlatformId, returnTo: string) {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const pending: PendingOAuth = { state, verifier, returnTo: safeReturnTo(returnTo), createdAt: Date.now() };
  const jar = await cookies();
  jar.set(cookieName(platform), encrypt(pending), {
    httpOnly: true,
    secure: isSecureOrigin(),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: MAX_AGE_SECONDS,
  });
  return { state, codeChallenge: sha256Base64Url(verifier) };
}

export async function completeOAuth(platform: PlatformId, state: string | null) {
  const jar = await cookies();
  const raw = jar.get(cookieName(platform))?.value;
  jar.set(cookieName(platform), "", { path: "/api/auth", maxAge: 0 });
  const pending = raw ? decrypt<PendingOAuth>(raw) : null;
  if (!pending || !state || pending.state !== state) {
    throw badRequest("Giriş doğrulanamadı (state uyuşmuyor). Lütfen tekrar deneyin.");
  }
  if (Date.now() - pending.createdAt > MAX_AGE_SECONDS * 1000) {
    throw badRequest("Giriş isteğinin süresi doldu. Lütfen tekrar deneyin.");
  }
  return { verifier: pending.verifier, returnTo: pending.returnTo };
}

/** Açık yönlendirme açığını önlemek için yalnızca site içi yollara izin verilir. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/transfer";
  return value;
}
