import { splitArtists } from "@/lib/matching/normalize";

// YouTube'da şarkı bilgisi yapılandırılmış değil; video başlığı ve kanal adından çıkarılır.
// Ör. "Tarkan - Şımarık (Official Video)" + "TarkanVEVO" → { artists: ["Tarkan"], title: "Şımarık" }

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', "#39": "'", apos: "'", lt: "<", gt: ">" };

export function decodeEntities(s: string): string {
  return s.replace(/&(amp|quot|#39|apos|lt|gt);/g, (_, e: string) => ENTITIES[e] ?? _);
}

const NOISE =
  /[([【](?:[^)\]】]*?\b(?:official|video|audio|lyrics?|lyric video|clip|klip|hd|hq|4k|mv|m\/v|visuali[sz]er|resmi|sözleri|şarkı sözleri)\b[^)\]】]*)[)\]】]/gi;

export function cleanChannelName(channel: string): string {
  return decodeEntities(channel)
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/\s*(official|resmi)\s*(channel|kanal[ıi])?$/i, "")
    .trim();
}

export function parseVideoTitle(rawTitle: string, rawChannel: string): { title: string; artists: string[] } {
  let title = decodeEntities(rawTitle).replace(NOISE, " ");
  title = title.split(/\s[|｜]\s/)[0]; // "Şarkı | Albüm adı" gibi eklerin ardını at
  title = title.replace(/\s{2,}/g, " ").trim();
  const channel = cleanChannelName(rawChannel);

  const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) {
    return { artists: splitArtists(m[1]), title: m[2].replace(/^["“']|["”']$/g, "").trim() };
  }
  return { artists: channel ? [channel] : [], title };
}

/** ISO 8601 süresini (PT3M42S) milisaniyeye çevirir. */
export function parseIsoDuration(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return (((d * 24 + h) * 60 + min) * 60 + s) * 1000;
}
