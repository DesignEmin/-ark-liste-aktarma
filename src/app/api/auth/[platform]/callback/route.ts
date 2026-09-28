import { NextResponse } from "next/server";
import { getAppUrl, redirectUriFor } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";
import { completeOAuth } from "@/lib/server/oauth";
import { resolvePlatform, route, type PlatformContext } from "@/lib/server/route-helpers";
import { writeToken } from "@/lib/server/session";

/** Platformdan dönüşte kodu token'a çevirir, şifreli çereze yazar ve uygulamaya geri yönlendirir. */
export const GET = route<PlatformContext>(async (req, ctx) => {
  const { platform, adapter } = await resolvePlatform(ctx);
  const params = req.nextUrl.searchParams;
  let returnTo = "/transfer";
  try {
    const pending = await completeOAuth(platform, params.get("state"));
    returnTo = pending.returnTo;

    const providerError = params.get("error") ?? params.get("error_reason");
    if (providerError) throw new AppError("NOT_AUTHENTICATED", "Giriş iptal edildi veya reddedildi.", 401);
    const code = params.get("code");
    if (!code || !adapter.handleCallback) throw new AppError("BAD_REQUEST", "Giriş kodu eksik.", 400);

    const token = await adapter.handleCallback({
      code,
      redirectUri: redirectUriFor(platform),
      codeVerifier: pending.verifier,
    });
    await writeToken(platform, token);
    return NextResponse.redirect(withQuery(returnTo, { connected: platform }));
  } catch (err) {
    if (!(err instanceof AppError)) console.error(err);
    const message = err instanceof AppError ? err.message : "Giriş sırasında beklenmeyen bir hata oluştu.";
    return NextResponse.redirect(withQuery(returnTo, { authError: message, platform }));
  }
});

function withQuery(path: string, query: Record<string, string>): string {
  const url = new URL(path, getAppUrl());
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}
