"use client";

import { Badge, Card, Progress } from "@/components/ui";
import { planFor, selectedCollections, transferProgress, type TransferJob } from "@/lib/client/job";
import { runTransfer } from "@/lib/client/orchestrator";
import type { PlatformStatus } from "@/lib/platform-status";
import { RunStatus } from "./RunStatus";
import { useAutoStart, useRunner, type Task } from "./useRunner";

export function TransferStep({
  job,
  setJob,
  platforms,
  refresh,
  onError,
}: {
  job: TransferJob;
  setJob: (j: TransferJob) => void;
  platforms: PlatformStatus[];
  refresh: () => void;
  onError: (m: string) => void;
}) {
  const target = platforms.find((p) => p.id === job.target);
  const runner = useRunner(job, setJob);
  const task: Task = async (working, cb) => {
    if (!target) throw new Error("Hedef platform bulunamadı.");
    await runTransfer(working, target.capabilities, cb);
  };
  useAutoStart(job.phase === "transfer" && Boolean(target), () => void runner.run(task));

  const { done, total } = transferProgress(job);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{target?.name ?? "Hedef"} platformuna aktarılıyor</h1>
        <p className="text-sm text-muted">
          Şarkılar platformun izin verdiği parti boyutlarıyla ekleniyor. İşlem yarıda kalırsa bu sayfaya dönüp devam
          edebilirsiniz; eklenen şarkılar tekrar eklenmez.
        </p>
      </div>
      <Card className="space-y-4">
        <Progress label="Toplam ilerleme" value={done} max={total} />
        <ul className="divide-y divide-border">
          {selectedCollections(job).map((c) => {
            const plan = c.plan ?? planFor(job, c);
            return (
              <li key={c.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {c.name} {c.kind === "liked" && <Badge tone="accent">Beğenilenler</Badge>}
                </span>
                <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted">
                  {Math.min(c.progress, plan.length)} / {plan.length}
                  {c.done ? <Badge tone="ok">Tamam</Badge> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      <RunStatus
        job={job}
        platforms={platforms}
        running={runner.running}
        pausing={runner.pausing}
        waitSeconds={runner.waitSeconds}
        stop={runner.stop}
        onPause={runner.pause}
        onResume={() => void runner.run(task)}
        refresh={refresh}
        onError={onError}
      />
    </div>
  );
}
