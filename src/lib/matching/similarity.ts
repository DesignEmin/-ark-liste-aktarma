/** Klasik Levenshtein düzenleme uzaklığı (iki satırlık bellek). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length > b.length) [a, b] = [b, a];

  let prev = new Array<number>(a.length + 1);
  let curr = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    const bj = b.charCodeAt(j - 1);
    for (let i = 1; i <= a.length; i++) {
      const cost = a.charCodeAt(i - 1) === bj ? 0 : 1;
      curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

/** 0–1 arası benzerlik: 1 - uzaklık / en uzun uzunluk */
export function levenshteinRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / max;
}

/** Kelime sırasından bağımsız benzerlik ("beatles the" ~ "the beatles"). */
function tokenSortRatio(a: string, b: string): number {
  const sort = (s: string) => s.split(" ").filter(Boolean).sort().join(" ");
  return levenshteinRatio(sort(a), sort(b));
}

/**
 * Normalize edilmiş iki metnin benzerliği (0–1).
 * Levenshtein, kelime sıralı Levenshtein ve "biri diğerini içeriyor" durumlarının en iyisi.
 */
export function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  let best = Math.max(levenshteinRatio(a, b), tokenSortRatio(a, b));
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && (` ${long} `).includes(` ${short} `)) {
    // "yesterday" ⊂ "yesterday remastered" — ama çok kısa eşleşmeler aldatıcı olabilir.
    best = Math.max(best, 0.8 + 0.2 * (short.length / long.length));
  }
  return best;
}
