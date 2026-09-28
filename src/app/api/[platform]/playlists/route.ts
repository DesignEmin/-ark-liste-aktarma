import { NextResponse } from "next/server";
import { resolvePlatform, route, type PlatformContext } from "@/lib/server/route-helpers";
import { requireToken } from "@/lib/server/session";

/** Kullanıcının çalma listeleri (ilk sayfada "Beğenilenler" de dahil). ?cursor= ile sayfalanır. */
export const GET = route<PlatformContext>(async (req, ctx) => {
  const { platform, adapter } = await resolvePlatform(ctx);
  const token = await requireToken(platform);
  const page = await adapter.getPlaylists(token, req.nextUrl.searchParams.get("cursor"));
  return NextResponse.json(page);
});
