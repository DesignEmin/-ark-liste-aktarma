"use client";

import Link from "next/link";
import { useMemo } from "react";
import { platformName } from "@/components/PlatformLogo";
import { Badge, Button, Card } from "@/components/ui";
import type { TransferJob } from "@/lib/client/job";
import { buildReport, downloadText, reportToCsv } from "@/lib/client/report";
import { tr } from "@/lib/i18n/tr";

export function ReportStep({ job }: { job: TransferJob }) {
  const report = useMemo(() => buildReport(job), [job]);
  const { totals } = report;
  const missing = totals.notFound + totals.skipped;

  const stat = (label: string, value: number, tone: string) => (
    <Card className="text-center">
      <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value.toLocaleString("tr-TR")}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Aktarım tamamlandı</h1>
        <p className="text-sm text-muted">
          {platformName(job.source)} → {job.target ? platformName(job.target) : ""}
          {job.finishedAt ? ` · ${new Date(job.finishedAt).toLocaleString("tr-TR")}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Kaynak şarkı", totals.source, "")}
        {stat("Aktarılan", totals.transferred, "text-ok")}
        {stat("Bulunamayan", totals.notFound, "text-bad")}
        {stat("Atlanan", totals.skipped, "text-warn")}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={missing === 0}
          onClick={() => downloadText(`bulunamayanlar-${job.id}.csv`, reportToCsv(report))}
        >
          {tr.actions.downloadCsv}
        </Button>
        <Link href="/transfer" className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 font-medium hover:bg-surface-2">
          {tr.actions.newTransfer}
        </Link>
      </div>

      <div className="space-y-3">
        {report.collections.map((c) => (
          <Card key={c.key} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {c.name} {c.kind === "liked" && <Badge tone="accent">Beğenilenler</Badge>}
              </p>
              {c.url && (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline">
                  Hedefte aç
                </a>
              )}
            </div>
            <p className="text-sm text-muted">
              {c.transferred} / {c.sourceCount} şarkı aktarıldı
              {c.notFound.length ? ` · ${c.notFound.length} bulunamadı` : ""}
              {c.skipped.length ? ` · ${c.skipped.length} atlandı` : ""}
            </p>
            {c.loadError && <p className="text-sm text-warn">Liste okunamadı: {c.loadError}</p>}
            {c.notFound.length + c.skipped.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm text-accent">Aktarılamayan şarkıları göster</summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {[...c.notFound.map((t) => ({ t, s: "Bulunamadı" })), ...c.skipped.map((t) => ({ t, s: "Atlandı" }))].map(
                    ({ t, s }) => (
                      <li key={`${s}-${t.id}`} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {t.artists.join(", ")} – {t.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted">{s}</span>
                      </li>
                    ),
                  )}
                </ul>
              </details>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
