import { NextResponse } from "next/server";
import { badRequest } from "@/lib/server/errors";
import { assertIdList, readJson, resolvePlatform, route, type PlatformContext } from "@/lib/server/route-helpers";
import { requireToken } from "@/lib/server/session";

export const maxDuration = 60;

/** Listeye bir parti şarkı ekler. Parti boyutu platformun toplu ekleme sınırını aşamaz. */
export const POST = route<PlatformContext>(async (req, ctx) => {
  const { platform, adapter } = await resolvePlatform(ctx);
  const body = await readJson<{ playlistId?: unknown; trackIds?: unknown }>(req);
  if (typeof body.playlistId !== "string" || !body.playlistId || body.playlistId.length > 200) {
    throw badRequest("playlistId gerekli.");
  }
  const ids = assertIdList(body.trackIds, adapter.capabilities.maxAddBatch);
  const token = await requireToken(platform);
  await adapter.addTracks(token, body.playlistId, ids);
  return NextResponse.json({ added: ids.length });
});
