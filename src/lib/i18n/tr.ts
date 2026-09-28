import type { MatchStatus, PlatformId } from "@/lib/types";

// Arayüzde birden fazla yerde kullanılan Türkçe metinler.

export const tr = {
  appName: "Müzik Listesi Aktarıcı",
  tagline: "Çalma listelerinizi ve beğendiğiniz şarkıları platformlar arasında taşıyın.",
  steps: {
    source: "Kaynak",
    select: "Seçim",
    target: "Hedef",
    match: "Eşleştirme",
    transfer: "Aktarım",
    done: "Rapor",
  },
  status: {
    matched: "Bulundu",
    uncertain: "Emin değil",
    notFound: "Bulunamadı",
  } satisfies Record<MatchStatus, string>,
  platformNames: {
    spotify: "Spotify",
    youtube: "YouTube Music",
    apple: "Apple Music",
    deezer: "Deezer",
  } satisfies Record<PlatformId, string>,
  actions: {
    connect: "Bağlan",
    disconnect: "Bağlantıyı kes",
    continue: "Devam",
    back: "Geri",
    pause: "Duraklat",
    resume: "Devam et",
    start: "Başlat",
    downloadCsv: "Bulunamayanları CSV indir",
    newTransfer: "Yeni aktarım",
  },
  errors: {
    notConfigured: "Bu platformun API anahtarları sunucuda tanımlı değil.",
    auth: "Oturumun süresi doldu. Lütfen tekrar bağlanın; işlem kaldığı yerden devam edecek.",
    quota: "Günlük API kotası doldu. Kota yenilendiğinde bu sayfaya dönüp devam edebilirsiniz.",
  },
};

export const platformColors: Record<PlatformId, string> = {
  spotify: "#1DB954",
  youtube: "#FF0033",
  apple: "#FA243C",
  deezer: "#A238FF",
};

export function formatDuration(ms?: number): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatSeconds(total: number): string {
  if (total < 60) return `${total} sn`;
  const h = Math.floor(total / 3600);
  const m = Math.ceil((total % 3600) / 60);
  return h ? `${h} sa ${m} dk` : `${m} dk`;
}
