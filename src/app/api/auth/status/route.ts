import { NextResponse } from "next/server";
import { allAdapters } from "@/lib/adapters/registry";
import type { PlatformStatus } from "@/lib/platform-status";
import { route } from "@/lib/server/route-helpers";
import { readToken } from "@/lib/server/session";

/** Hangi platformların yapılandırıldığını ve bağlı olduğunu döndürür. Token'lar asla dönmez. */
export const GET = route(async () => {
  const platforms: PlatformStatus[] = [];
  for (const adapter of allAdapters()) {
    const configured = adapter.isConfigured();
    const token = configured ? await readToken(adapter.id) : null;
    const expired = Boolean(token?.expiresAt && token.expiresAt < Date.now() && !token.refreshToken);
    platforms.push({
      id: adapter.id,
      name: adapter.displayName,
      configured,
      connected: Boolean(token) && !expired,
      userName: token && !expired ? token.userName : undefined,
      capabilities: adapter.capabilities,
    });
  }
  return NextResponse.json({ platforms }, { headers: { "Cache-Control": "no-store" } });
});
