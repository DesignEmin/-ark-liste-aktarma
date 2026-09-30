import { afterEach, describe, expect, it, vi } from "vitest";
import { youtubeAdapter } from "@/lib/adapters/youtube";

describe("YouTube adapter istekleri", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("videos.list isteğinde id ile birlikte maxResults göndermez", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      const body = url.includes("/search")
        ? { items: [{ id: { videoId: "abc" } }] }
        : { items: [{ id: "abc", snippet: { title: "Tarkan - Şımarık", channelTitle: "Tarkan" }, contentDetails: { duration: "PT3M56S" } }] };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const tracks = await youtubeAdapter.searchTrack({ accessToken: "t" }, { kind: "text", title: "Şımarık", artist: "Tarkan" });
    expect(tracks[0]).toMatchObject({ id: "abc", title: "Şımarık", artists: ["Tarkan"], durationMs: 236_000 });

    const videosCall = urls.find((u) => u.includes("/videos?"))!;
    expect(videosCall).toContain("id=abc");
    expect(videosCall).not.toContain("maxResults");
  });
});
