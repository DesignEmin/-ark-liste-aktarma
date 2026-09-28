import { NextResponse } from "next/server";
import { redirectUriFor } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";
import { beginOAuth } from "@/lib/server/oauth";
import { resolvePlatform, route, type PlatformContext } from "@/lib/server/route-helpers";

/** OAuth akışını başlatır ve kullanıcıyı platformun giriş sayfasına yönlendirir. */
export const GET = route<PlatformContext>(async (req, ctx) => {
  const { platform, adapter } = await resolvePlatform(ctx);
  if (adapter.capabilities.authMode !== "oauth-redirect") {
    throw new AppError("BAD_REQUEST", `${adapter.displayName} girişi tarayıcıda MusicKit ile yapılır.`, 400);
  }
  const { state, codeChallenge } = await beginOAuth(platform, req.nextUrl.searchParams.get("returnTo") ?? "/transfer");
  const start = adapter.login({ redirectUri: redirectUriFor(platform), state, codeChallenge });
  if (start.type !== "redirect") throw new AppError("INTERNAL", "Beklenmeyen giriş türü.", 500);
  return NextResponse.redirect(start.url);
});
