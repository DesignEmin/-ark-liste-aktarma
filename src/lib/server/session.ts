import { cookies } from "next/headers";
import type { StoredToken } from "@/lib/adapters/types";
import { getAdapter } from "@/lib/adapters/registry";
import type { PlatformId } from "@/lib/types";
import { isSecureOrigin } from "./config";
import { decrypt, encrypt } from "./crypto";
import { notAuthenticated } from "./errors";

// Her platformun token'ı ayrı, AES-256-GCM ile şifrelenmiş, HTTP-only bir çerezde durur.
// JavaScript bu çerezleri okuyamaz; istemci yalnızca "bağlı mı" bilgisini görür.

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 gün
const REFRESH_MARGIN_MS = 60_000;
const cookieName = (platform: PlatformId) => `mla_${platform}`;

export async function readToken(platform: PlatformId): Promise<StoredToken | null> {
  const jar = await cookies();
  const raw = jar.get(cookieName(platform))?.value;
  return raw ? decrypt<StoredToken>(raw) : null;
}

export async function writeToken(platform: PlatformId, token: StoredToken) {
  const jar = await cookies();
  jar.set(cookieName(platform), encrypt(token), {
    httpOnly: true,
    secure: isSecureOrigin(),
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearToken(platform: PlatformId) {
  const jar = await cookies();
  jar.set(cookieName(platform), "", { path: "/", maxAge: 0 });
}

/** Geçerli bir token döndürür; süresi dolmak üzereyse yeniler ve çerezi günceller. */
export async function requireToken(platform: PlatformId): Promise<StoredToken> {
  const token = await readToken(platform);
  const adapter = getAdapter(platform);
  if (!token) throw notAuthenticated(adapter.displayName);

  const expiring = token.expiresAt !== undefined && token.expiresAt - REFRESH_MARGIN_MS < Date.now();
  if (!expiring) return token;

  if (!adapter.refresh || !token.refreshToken) {
    await clearToken(platform);
    throw notAuthenticated(adapter.displayName);
  }
  try {
    const refreshed = await adapter.refresh(token);
    await writeToken(platform, refreshed);
    return refreshed;
  } catch {
    await clearToken(platform);
    throw notAuthenticated(adapter.displayName);
  }
}
