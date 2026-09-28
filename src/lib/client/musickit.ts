"use client";

import { api } from "./api";

// Apple Music girişi: MusicKit JS'i yükle, sunucudan origin kısıtlı Developer Token al,
// kullanıcıya Apple'ın izin penceresini göster, dönen Music User Token'ı sunucuya ilet.

const SCRIPT_URL = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
let loading: Promise<typeof MusicKit> | null = null;

function loadMusicKit(): Promise<typeof MusicKit> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("MusicKit yüklenemedi (zaman aşımı).")), 20_000);
    document.addEventListener(
      "musickitloaded",
      () => {
        clearTimeout(timeout);
        if (window.MusicKit) resolve(window.MusicKit);
        else reject(new Error("MusicKit yüklenemedi."));
      },
      { once: true },
    );
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.dataset.webComponents = "";
    script.onerror = () => {
      clearTimeout(timeout);
      loading = null;
      reject(new Error("MusicKit betiği indirilemedi."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export async function connectAppleMusic(): Promise<void> {
  const [mk, { token }] = await Promise.all([loadMusicKit(), api.appleDeveloperToken()]);
  const music = await mk.configure({ developerToken: token, app: { name: "Müzik Listesi Aktarıcı", build: "1.0.0" } });
  const musicUserToken = await music.authorize();
  if (!musicUserToken) throw new Error("Apple Music izni verilmedi.");
  await api.appleUserToken(musicUserToken);
}
