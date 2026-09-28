import { NextResponse } from "next/server";
import { badRequest } from "@/lib/server/errors";
import { resolvePlatform, route, type PlatformContext } from "@/lib/server/route-helpers";
import { requireToken } from "@/lib/server/session";
import { LIKED_ID } from "@/lib/types";

export const maxDuration = 60;

/** Bir listenin (ya da playlistId=__liked__ ile beğenilenlerin) bir sayfa şarkısı. */
export const GET = route<PlatformContext>(async (req, ctx) => {
  const { platform, adapter } = await resolvePlatform(ctx);
  const playlistId = req.nextUrl.searchParams.get("playlistId");
  if (!playlistId || playlistId.length > 200) throw badRequest("playlistId gerekli.");
  const cursor = req.nextUrl.searchParams.get("cursor");
  const token = await requireToken(platform);
  const page =
    playlistId === LIKED_ID
      ? await adapter.getLikedTracks(token, cursor)
      : await adapter.getPlaylistTracks(token, playlistId, cursor);
  return NextResponse.json(page);
});
