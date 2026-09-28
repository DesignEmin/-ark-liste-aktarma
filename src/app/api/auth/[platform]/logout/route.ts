import { NextResponse } from "next/server";
import { resolvePlatform, route, type PlatformContext } from "@/lib/server/route-helpers";
import { clearToken } from "@/lib/server/session";

export const POST = route<PlatformContext>(async (_req, ctx) => {
  const { platform } = await resolvePlatform(ctx);
  await clearToken(platform);
  return NextResponse.json({ ok: true });
});
