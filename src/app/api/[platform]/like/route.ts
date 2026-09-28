import { NextResponse } from "next/server";
import { assertIdList, readJson, resolvePlatform, route, type PlatformContext } from "@/lib/server/route-helpers";
import { requireToken } from "@/lib/server/session";

export const maxDuration = 60;

/** Bir parti şarkıyı hedef platformda "beğenilenlere" ekler. */
export const POST = route<PlatformContext>(async (req, ctx) => {
  const { platform, adapter } = await resolvePlatform(ctx);
  const body = await readJson<{ trackIds?: unknown }>(req);
  const ids = assertIdList(body.trackIds, adapter.capabilities.maxLikeBatch);
  const token = await requireToken(platform);
  await adapter.likeTrack(token, ids);
  return NextResponse.json({ liked: ids.length });
});
