"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { selectedCollections, type JobPhase, type TransferJob } from "@/lib/client/job";
import { deleteJob, listJobs } from "@/lib/client/job-store";
import { PlatformLogo, platformName } from "./PlatformLogo";
import { Badge, Button, Card } from "./ui";

const PHASE_LABEL: Record<JobPhase, string> = {
  select: "Liste seçimi",
  target: "Hedef seçimi",
  match: "Eşleştiriliyor",
  review: "Kontrol bekliyor",
  transfer: "Aktarılıyor",
  done: "Tamamlandı",
};

/** Bu tarayıcıda kayıtlı aktarımlar; yarım kalanlar kaldığı yerden devam ettirilebilir. */
export function ResumeList() {
  const [jobs, setJobs] = useState<TransferJob[] | null>(null);

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch(() => setJobs([]));
  }, []);

  if (!jobs || jobs.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Aktarımlarınız</h2>
      <ul className="space-y-2">
        {jobs.slice(0, 10).map((j) => {
          const cols = selectedCollections(j);
          return (
            <li key={j.id}>
              <Card className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <PlatformLogo id={j.source} size={24} />
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                  {j.target ? <PlatformLogo id={j.target} size={24} /> : <span className="text-muted">?</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {cols.length ? cols.map((c) => c.name).join(", ") : platformName(j.source)}
                  </p>
                  <p className="text-xs text-muted">{new Date(j.updatedAt).toLocaleString("tr-TR")}</p>
                </div>
                <Badge tone={j.phase === "done" ? "ok" : "warn"}>{PHASE_LABEL[j.phase]}</Badge>
                <div className="flex gap-1">
                  <Link
                    href={`/transfer?job=${j.id}`}
                    className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm hover:bg-surface-2"
                  >
                    {j.phase === "done" ? "Raporu gör" : "Devam et"}
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Sil"
                    onClick={async () => {
                      if (!confirm("Bu aktarım kaydı silinsin mi? (Hedefe aktarılmış şarkılar silinmez.)")) return;
                      await deleteJob(j.id);
                      setJobs((list) => list?.filter((x) => x.id !== j.id) ?? null);
                    }}
                  >
                    Sil
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
