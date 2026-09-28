import { describe, expect, it } from "vitest";
import { parseIsoDuration, parseVideoTitle } from "@/lib/adapters/youtube-title";
import type { MusicAdapter } from "@/lib/adapters/types";
import { buildResult, matchTrack, rankCandidates, statusFor } from "@/lib/matching/matcher";
import {
  cleanTitle,
  extractFeatured,
  foldText,
  normalizedArtists,
  normalizeTitle,
  splitArtists,
} from "@/lib/matching/normalize";
import { durationScore, scoreCandidate } from "@/lib/matching/score";
import { levenshtein, textSimilarity } from "@/lib/matching/similarity";
import type { Track } from "@/lib/types";

const t = (title: string, artists: string[], durationMs?: number, isrc?: string, id = title): Track => ({
  id,
  platform: "spotify",
  title,
  artists,
  durationMs,
  isrc,
});

describe("normalize", () => {
  it("Türkçe karakterleri ve büyük harfleri katlar", () => {
    expect(foldText("IŞIK ığdır İstanbul Çağrı Göğüs Ünlü Öykü")).toBe("isik igdir istanbul cagri gogus unlu oyku");
    expect(foldText("Beyoncé Straße")).toBe("beyonce strasse");
  });

  it("feat. kısmını başlıktan ayırır", () => {
    expect(extractFeatured("Yalan (feat. Ezhel & Murda)")).toEqual({ title: "Yalan", featured: ["Ezhel", "Murda"] });
    expect(extractFeatured("Song ft. Someone")).toEqual({ title: "Song", featured: ["Someone"] });
    expect(extractFeatured("Song [with Other]")).toEqual({ title: "Song", featured: ["Other"] });
  });

  it("sürüm eklerini ve parantezleri temizler", () => {
    expect(cleanTitle("Hey Jude - Remastered 2015")).toBe("Hey Jude");
    expect(cleanTitle("Bohemian Rhapsody (Live Aid) - 2011 Remaster")).toBe("Bohemian Rhapsody");
    expect(cleanTitle("Şımarık [Radio Edit]")).toBe("Şımarık");
    expect(cleanTitle("(Intro)")).toBe("(Intro)");
    expect(normalizeTitle("Gülpembe - Canlı")).toBe("gulpembe");
  });

  it("sanatçıları böler ama AC/DC'yi bölmez", () => {
    expect(splitArtists("Sezen Aksu, Tarkan & Sertab Erener")).toEqual(["Sezen Aksu", "Tarkan", "Sertab Erener"]);
    expect(splitArtists("AC/DC")).toEqual(["AC/DC"]);
    expect(normalizedArtists(["The Beatles"], "Song (feat. Billy Preston)")).toEqual(["beatles", "billy preston"]);
  });
});

describe("similarity", () => {
  it("levenshtein", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
  it("kelime sırası ve kapsama", () => {
    expect(textSimilarity("beatles the", "the beatles")).toBe(1);
    expect(textSimilarity("yesterday", "yesterday remastered")).toBeGreaterThan(0.85);
  });
});

describe("score", () => {
  it("süre toleransı ±3 sn", () => {
    expect(durationScore(200_000, 202_900)).toBe(1);
    expect(durationScore(200_000, 230_000)).toBe(0);
    expect(durationScore(200_000, undefined)).toBeNull();
  });

  it("farklı yazılmış aynı şarkı yüksek puan alır", () => {
    const src = t("Şımarık", ["Tarkan"], 236_000);
    const cand = t("Simarik - Remastered", ["TARKAN"], 237_500);
    expect(scoreCandidate(src, cand).total).toBeGreaterThanOrEqual(0.85);
  });

  it("canlı kayıt cezalandırılır", () => {
    const src = t("Hotel California", ["Eagles"], 391_000);
    const studio = t("Hotel California - 2013 Remaster", ["Eagles"], 391_500);
    const live = t("Hotel California (Live)", ["Eagles"], 430_000);
    expect(scoreCandidate(src, studio).total).toBeGreaterThan(scoreCandidate(src, live).total);
    expect(scoreCandidate(src, live).total).toBeLessThan(0.85);
  });

  it("ISRC eşleşmesi kesin kabul edilir", () => {
    const src = t("Some Title", ["X"], 180_000, "TRA123456789");
    const cand = t("Totally Different Name", ["Y"], 181_000, "tra123456789");
    expect(scoreCandidate(src, cand).total).toBeGreaterThanOrEqual(0.98);
  });

  it("alakasız şarkı düşük puan alır", () => {
    expect(scoreCandidate(t("Firuze", ["Sezen Aksu"], 250_000), t("Thunderstruck", ["AC/DC"], 292_000)).total).toBeLessThan(0.4);
  });
});

describe("matcher", () => {
  it("adayları sıralar ve durumu belirler", () => {
    const src = t("Firuze", ["Sezen Aksu"], 250_000);
    const ranked = rankCandidates(src, [
      { track: t("Firuze (Live)", ["Sezen Aksu"], 300_000, undefined, "a"), via: "search" },
      { track: t("Firuze", ["Sezen Aksu"], 250_500, undefined, "b"), via: "search" },
    ]);
    expect(ranked[0].track.id).toBe("b");
    const result = buildResult(ranked);
    expect(result.status).toBe("matched");
    expect(result.selectedId).toBe("b");
  });

  it("eşikler", () => {
    expect(statusFor(0.9)).toBe("matched");
    expect(statusFor(0.7)).toBe("uncertain");
    expect(statusFor(0.3)).toBe("notFound");
    expect(buildResult([]).status).toBe("notFound");
  });
});

describe("youtube başlık ayrıştırma", () => {
  it("sanatçı - şarkı biçimi", () => {
    expect(parseVideoTitle("Tarkan - Şımarık (Official Video)", "TarkanVEVO")).toEqual({
      artists: ["Tarkan"],
      title: "Şımarık",
    });
  });
  it("Topic kanalı", () => {
    expect(parseVideoTitle("Gülpembe", "Barış Manço - Topic")).toEqual({ artists: ["Barış Manço"], title: "Gülpembe" });
  });
  it("HTML varlıkları ve süre", () => {
    expect(parseVideoTitle("Simon &amp; Garfunkel - The Boxer", "x").artists).toEqual(["Simon", "Garfunkel"]);
    expect(parseIsoDuration("PT3M42S")).toBe(222_000);
    expect(parseIsoDuration("PT1H2S")).toBe(3_602_000);
  });
});

describe("matchTrack (sahte adapter)", () => {
  function fakeAdapter(opts: { isrc: boolean; quota?: boolean; results: Record<string, Track[]> }) {
    const calls: string[] = [];
    const adapter = {
      id: "spotify",
      displayName: "Sahte",
      capabilities: {
        isrcSearch: opts.isrc,
        maxAddBatch: 100,
        maxLikeBatch: 50,
        authMode: "oauth-redirect",
        quota: opts.quota ? { dailyUnits: 10000, searchCost: 100, addCost: 50, likeCost: 50 } : undefined,
      },
      searchTrack: async (_t: unknown, q: { kind: string; isrc?: string; title?: string; artist?: string }) => {
        const key = q.kind === "isrc" ? `isrc:${q.isrc}` : `text:${q.artist ?? ""}|${q.title}`;
        calls.push(key);
        return opts.results[key] ?? [];
      },
    } as unknown as MusicAdapter;
    return { adapter, calls };
  }
  const token = { accessToken: "x" };

  it("ISRC ile bulunursa metin araması yapmaz", async () => {
    const { adapter, calls } = fakeAdapter({
      isrc: true,
      results: { "isrc:TRA129700001": [t("Şımarık", ["Tarkan"], 236_000, "TRA129700001", "x1")] },
    });
    const r = await matchTrack(adapter, token, t("Şımarık", ["Tarkan"], 236_000, "TRA129700001"));
    expect(r.status).toBe("matched");
    expect(r.selectedId).toBe("x1");
    expect(calls).toEqual(["isrc:TRA129700001"]);
  });

  it("temizlenmiş başlık + ilk sanatçı ile arar", async () => {
    const { adapter, calls } = fakeAdapter({
      isrc: false,
      results: { "text:Ezhel|Yalan": [t("Yalan", ["Ezhel", "Murda"], 180_000, undefined, "y1")] },
    });
    const r = await matchTrack(adapter, token, t("Yalan (feat. Murda) - Remastered", ["Ezhel"], 181_000));
    expect(r.selectedId).toBe("y1");
    expect(calls).toEqual(["text:Ezhel|Yalan"]);
  });

  it("kotalı platformda makul aday varsa gevşek arama yapmaz", async () => {
    const { adapter, calls } = fakeAdapter({
      isrc: false,
      quota: true,
      results: { "text:Sezen Aksu|Firuze": [t("Firuze (Live)", ["Sezen Aksu"], 300_000, undefined, "f1")] },
    });
    const r = await matchTrack(adapter, token, t("Firuze", ["Sezen Aksu"], 250_000));
    expect(r.status).toBe("uncertain");
    expect(r.selectedId).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
