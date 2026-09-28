import { NextResponse } from "next/server";
import { badRequest } from "@/lib/server/errors";
import { readJson, resolvePlatform, route, type PlatformContext } from "@/lib/server/route-helpers";
import { requireToken } from "@/lib/server/session";

/** Hedef platformda yeni bir çalma listesi oluşturur. */
export const POST = route<PlatformContext>(async (req, ctx) => {
  const { platform, adapter } = await resolvePlatform(ctx);
  const body = await readJson<{ name?: unknown; description?: unknown }>(req);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 150) : "";
  if (!name) throw badRequest("Liste adı gerekli.");
  const description = typeof body.description === "string" ? body.description.slice(0, 300) : undefined;
  const token = await requireToken(platform);
  const created = await adapter.createPlaylist(token, name, description);
  return NextResponse.json(created);
});
