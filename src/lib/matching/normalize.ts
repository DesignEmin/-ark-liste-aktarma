// Başlık ve sanatçı adlarını karşılaştırılabilir hale getirir.
//  - Türkçe ve diğer dillere özgü karakterler katlanır (ı/İ→i, ş→s, ğ→g, é→e, ß→ss …)
//  - Büyük/küçük harf farkı kaldırılır
//  - "feat./ft./with" kısımları başlıktan ayrılır ve sanatçılara eklenir
//  - "(Live)", "[Remastered 2011]", "- Radio Edit" gibi ekler silinir

const SPECIAL: Record<string, string> = {
  ı: "i",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
};

/** Harfleri ASCII karşılıklarına katlar ve küçük harfe çevirir. */
export function foldText(input: string): string {
  return input
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ıßæœøłđðþ]/g, (c) => SPECIAL[c] ?? c);
}

/** Katlama + noktalama temizliği + boşluk sadeleştirme. */
export function normalizeText(input: string): string {
  return foldText(input)
    .replace(/[’'`´]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FEAT_WORD = String.raw`(?:feat\.?|ft\.?|featuring|with|con|w\/)`;
const FEAT_IN_BRACKETS = new RegExp(String.raw`[(\[]\s*${FEAT_WORD}\s+([^)\]]+)[)\]]`, "i");
const FEAT_TRAILING = new RegExp(String.raw`\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$`, "i");

/** "Şarkı (feat. X & Y)" → { title: "Şarkı", featured: ["X", "Y"] } */
export function extractFeatured(title: string): { title: string; featured: string[] } {
  let t = title;
  const featured: string[] = [];
  const bracket = t.match(FEAT_IN_BRACKETS);
  if (bracket) {
    featured.push(...splitArtists(bracket[1]));
    t = t.replace(FEAT_IN_BRACKETS, " ");
  }
  const trailing = t.match(FEAT_TRAILING);
  if (trailing) {
    featured.push(...splitArtists(trailing[1]));
    t = t.replace(FEAT_TRAILING, "");
  }
  return { title: t.replace(/\s{2,}/g, " ").trim(), featured };
}

/** "A, B & C feat. D" → ["A", "B", "C", "D"] */
export function splitArtists(s: string): string[] {
  return s
    .split(/\s*(?:,|;|&|\s+x\s+|\bfeat\.|\bfeat\b|\bft\.|\bft\b|\bfeaturing\b)\s*/i)
    .map((a) => a.trim())
    .filter(Boolean);
}

// Başlığın sonundaki " - Remastered 2011", " - Live at Wembley", " - Radio Edit" gibi ekler
const DASH_SUFFIX =
  /\s+[-–—]\s+(?:[^-–—]*(?<![\p{L}\p{N}])(?:remaster(?:ed)?|live|edit|version|versiyon|mix|mono|stereo|demo|acoustic|akustik|bonus|deluxe|single|original|from|soundtrack|canl[ıi]|instrumental|remix|re-?recorded|anniversary|explicit|clean)(?![\p{L}\p{N}])[^-–—]*)$/iu;

/** Parantez/köşeli parantez içindeki ekleri ve tire sonrası sürüm eklerini siler. */
export function cleanTitle(title: string): string {
  let t = extractFeatured(title).title;
  // Birden fazla sonek olabilir: "Song - 2011 Remaster - Live"
  for (let i = 0; i < 3 && DASH_SUFFIX.test(t); i++) t = t.replace(DASH_SUFFIX, "");
  t = t.replace(/\s*[(\[【][^)\]】]*[)\]】]/g, " ");
  const cleaned = t.replace(/\s{2,}/g, " ").trim();
  // Başlığın tamamı parantez içindeyse boş kalmasın
  return cleaned || title.trim();
}

export function normalizeTitle(title: string): string {
  return normalizeText(cleanTitle(title));
}

export function normalizeArtist(artist: string): string {
  return normalizeText(artist).replace(/^the /, "");
}

/** Kaynak şarkının tüm sanatçıları (başlıktaki feat. dahil) normalize edilmiş halde. */
export function normalizedArtists(artists: string[], title?: string): string[] {
  const all = [...artists.flatMap(splitArtists)];
  if (title) all.push(...extractFeatured(title).featured);
  return [...new Set(all.map(normalizeArtist).filter(Boolean))];
}

/**
 * Farklı kayıt olduğunu gösteren sürüm etiketleri. "Remastered" aynı kayıt sayılır;
 * "Live", "Remix", "Acoustic" gibi etiketler farklı kayıt demektir.
 */
const VERSION_TAGS: Array<[string, RegExp]> = [
  ["live", /\b(live|canli|concert|konser)\b/],
  ["remix", /\b(remix|rmx)\b/],
  ["acoustic", /\b(acoustic|akustik|unplugged)\b/],
  ["instrumental", /\b(instrumental|enstrumantal)\b/],
  ["karaoke", /\b(karaoke)\b/],
  ["cover", /\b(cover)\b/],
  ["speed", /\b(sped up|speed up|slowed|reverb|nightcore)\b/],
  ["demo", /\b(demo)\b/],
];

export function versionTags(title: string): Set<string> {
  const t = normalizeText(title);
  const tags = new Set<string>();
  for (const [name, re] of VERSION_TAGS) if (re.test(t)) tags.add(name);
  return tags;
}
