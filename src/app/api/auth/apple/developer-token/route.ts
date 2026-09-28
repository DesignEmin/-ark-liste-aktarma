import { NextResponse } from "next/server";
import { getAppleDeveloperToken } from "@/lib/server/apple-jwt";
import { route } from "@/lib/server/route-helpers";

// MusicKit JS'in çalışması için tarayıcıya bir Developer Token verilmesi gerekir.
// Bu token "origin" kısıtlıdır ve kısa ömürlüdür; .p8 özel anahtarı sunucudan hiç çıkmaz.
export const GET = route(async () => {
  const token = await getAppleDeveloperToken("client");
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
});
