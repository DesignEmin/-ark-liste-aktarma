import { describe, expect, it } from "vitest";
import { parseImportFile } from "@/lib/import";
import { parseDuration } from "@/lib/import/csv";
import { parseLine } from "@/lib/import/text";

describe("CSV içe aktarma", () => {
  it("Exportify biçimi", () => {
    const csv = [
      '"Track URI","Track Name","Album Name","Artist Name(s)","Release Date","Duration (ms)","ISRC"',
      '"spotify:track:1","Şımarık","Ölürüm Sana","Tarkan","1997","236000","TRA129700001"',
      '"spotify:track:2","Yalan","X","Ezhel,Murda","2019","180500",""',
    ].join("\n");
    const r = parseImportFile("Favorilerim.csv", "﻿" + csv);
    expect(r.format).toBe("exportify");
    expect(r.collections).toHaveLength(1);
    expect(r.collections[0].name).toBe("Favorilerim");
    const [a, b] = r.collections[0].tracks;
    expect(a).toMatchObject({ title: "Şımarık", artists: ["Tarkan"], durationMs: 236000, isrc: "TRA129700001" });
    expect(b.artists).toEqual(["Ezhel", "Murda"]);
    expect(b.isrc).toBeUndefined();
  });

  it("TuneMyMusic biçimi listeleri ayırır", () => {
    const csv = [
      "Track name,Artist name,Album,Playlist name,Type,ISRC",
      "Firuze,Sezen Aksu,Firuze,Yolculuk,Playlist,",
      "Gülpembe,Barış Manço,Değmesin Yağlı Boya,Yolculuk,Playlist,",
      "Hey Jude,The Beatles,1,,Favorite,GBAYE0601690",
    ].join("\n");
    const r = parseImportFile("tmm.csv", csv);
    expect(r.format).toBe("tunemymusic");
    const names = r.collections.map((c) => `${c.kind}:${c.name}`);
    expect(names).toEqual(["playlist:Yolculuk", "liked:Beğenilen Şarkılar"]);
    expect(r.collections[0].tracks).toHaveLength(2);
  });

  it("Türkçe başlıklı genel CSV", () => {
    const r = parseImportFile("liste.csv", "Sanatçı,Şarkı,Süre\nMFÖ,Ele Güne Karşı,4:05\n");
    expect(r.collections[0].tracks[0]).toMatchObject({ title: "Ele Güne Karşı", artists: ["MFÖ"], durationMs: 245000 });
  });

  it("süre ayrıştırma", () => {
    expect(parseDuration("3:45")).toBe(225000);
    expect(parseDuration("225")).toBe(225000);
    expect(parseDuration("225000", "Duration (ms)")).toBe(225000);
  });
});

describe("düz metin", () => {
  it("satır biçimleri", () => {
    expect(parseLine("Tarkan - Şımarık")).toEqual({ artist: "Tarkan", title: "Şımarık", durationMs: undefined });
    expect(parseLine("1. Sezen Aksu – Firuze (4:10)")).toEqual({ artist: "Sezen Aksu", title: "Firuze", durationMs: 250000 });
    expect(parseLine("Sadece Başlık")).toEqual({ title: "Sadece Başlık", durationMs: undefined });
    expect(parseLine("# yorum")).toBeNull();
  });

  it("dosyayı tekilleştirir", () => {
    const r = parseImportFile("yol.txt", "Tarkan - Şımarık\ntarkan - şımarık\n\nMFÖ - Peki Peki Anladık\n");
    expect(r.format).toBe("text");
    expect(r.collections[0].tracks).toHaveLength(2);
  });
});

describe("Spotify veri indirme JSON", () => {
  it("YourLibrary.json", () => {
    const json = JSON.stringify({ tracks: [{ artist: "Tarkan", album: "A", track: "Kuzu Kuzu", uri: "spotify:track:x" }], albums: [] });
    const r = parseImportFile("YourLibrary.json", json);
    expect(r.format).toBe("spotify-library");
    expect(r.collections[0]).toMatchObject({ kind: "liked", name: "Beğenilen Şarkılar" });
  });

  it("Playlist1.json", () => {
    const json = JSON.stringify({
      playlists: [
        { name: "Yol", items: [{ track: { trackName: "Firuze", artistName: "Sezen Aksu", albumName: "F" } }, { track: null, episode: {} }] },
      ],
    });
    const r = parseImportFile("Playlist1.json", json);
    expect(r.format).toBe("spotify-playlists");
    expect(r.collections[0].tracks).toHaveLength(1);
  });

  it("dinleme geçmişi", () => {
    const json = JSON.stringify([
      { artistName: "A", trackName: "Kısa", msPlayed: 5000 },
      { artistName: "B", trackName: "Uzun", msPlayed: 120000 },
      { artistName: "B", trackName: "Uzun", msPlayed: 120000 },
      { artistName: "C", trackName: "Bir kez", msPlayed: 60000 },
    ]);
    const r = parseImportFile("StreamingHistory0.json", json);
    expect(r.collections[0].tracks.map((t) => t.title)).toEqual(["Uzun", "Bir kez"]);
  });
});
