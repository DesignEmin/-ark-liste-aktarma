import Link from "next/link";
import { PlatformLogo } from "@/components/PlatformLogo";
import { ResumeList } from "@/components/ResumeList";
import { tr } from "@/lib/i18n/tr";
import { PLATFORM_IDS } from "@/lib/types";

const STEPS = [
  ["Kaynağı seçin", "Bir platforma bağlanın ya da CSV / TXT / Spotify JSON dosyası yükleyin."],
  ["Listeleri seçin", "Çalma listelerinizi ve beğenilen şarkılarınızı işaretleyin."],
  ["Eşleşmeleri kontrol edin", "ISRC ve akıllı başlık karşılaştırmasıyla bulunan şarkıları gözden geçirin."],
  ["Aktarın", "Listeler hedefte aynı adla oluşturulur, beğeniler aktarılır, rapor hazırlanır."],
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex gap-2">
          {PLATFORM_IDS.map((id) => (
            <PlatformLogo key={id} id={id} size={28} />
          ))}
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{tr.appName}</h1>
        <p className="max-w-2xl text-muted">
          {tr.tagline} Spotify, YouTube Music, Apple Music ve Deezer arasında çalma listelerinizi ve beğendiğiniz
          şarkıları otomatik aktarın.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/transfer"
            className="inline-flex h-11 items-center rounded-lg bg-accent px-5 font-medium text-accent-fg hover:opacity-90"
          >
            Platformdan aktar
          </Link>
          <Link
            href="/transfer?mode=file"
            className="inline-flex h-11 items-center rounded-lg border border-border bg-surface px-5 font-medium hover:bg-surface-2"
          >
            Dosyadan içe aktar
          </Link>
        </div>
      </section>

      <ResumeList />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Nasıl çalışır?</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="rounded-xl border border-border bg-surface p-4">
              <p className="font-medium">
                <span className="mr-2 text-accent">{i + 1}.</span>
                {title}
              </p>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
