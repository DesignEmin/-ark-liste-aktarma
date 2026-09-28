import { NextResponse } from "next/server";
import { verifyAppleUserToken } from "@/lib/adapters/apple";
import { badRequest } from "@/lib/server/errors";
import { readJson, route } from "@/lib/server/route-helpers";
import { writeToken } from "@/lib/server/session";

/** MusicKit'in verdiği Music User Token'ı doğrular ve şifreli çereze yazar. */
export const POST = route(async (req) => {
  const body = await readJson<{ musicUserToken?: unknown }>(req);
  const mut = body.musicUserToken;
  if (typeof mut !== "string" || mut.length < 20 || mut.length > 4000) throw badRequest("Geçersiz Music User Token.");
  const token = await verifyAppleUserToken(mut);
  await writeToken("apple", token);
  return NextResponse.json({ ok: true });
});
