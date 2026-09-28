"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { createJob, type JobPhase, type TransferJob } from "@/lib/client/job";
import { loadJob, saveJob } from "@/lib/client/job-store";
import type { ImportedCollection } from "@/lib/import";
import { tr } from "@/lib/i18n/tr";
import type { PlatformStatus } from "@/lib/platform-status";
import { isPlatformId, type PlatformId } from "@/lib/types";
import { MatchStep } from "./MatchStep";
import { ReportStep } from "./ReportStep";
import { SelectStep } from "./SelectStep";
import { SourceStep } from "./SourceStep";
import { TargetStep } from "./TargetStep";
import { TransferStep } from "./TransferStep";

const STEPS: Array<{ id: JobPhase | "source"; label: string }> = [
  { id: "source", label: tr.steps.source },
  { id: "select", label: tr.steps.select },
  { id: "target", label: tr.steps.target },
  { id: "match", label: tr.steps.match },
  { id: "transfer", label: tr.steps.transfer },
  { id: "done", label: tr.steps.done },
];

function stepIndex(phase: JobPhase | "source") {
  if (phase === "review") return 3;
  return STEPS.findIndex((s) => s.id === phase);
}

export function TransferWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const jobId = params.get("job");
  const mode = params.get("mode") === "file" ? "file" : "platform";

  const [platforms, setPlatforms] = useState<PlatformStatus[] | null>(null);
  const [job, setJob] = useState<TransferJob | null>(null);
  const [missing, setMissing] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const handledQuery = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { platforms } = await api.status();
      setPlatforms(platforms);
    } catch (err) {
      setMessage({ tone: "bad", text: (err as Error).message });
      setPlatforms([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // OAuth dönüşündeki mesajlar (?connected=spotify veya ?authError=...)
  useEffect(() => {
    if (handledQuery.current) return;
    const authError = params.get("authError");
    const connected = params.get("connected");
    if (authError) setMessage({ tone: "bad", text: authError });
    else if (connected && isPlatformId(connected)) setMessage({ tone: "ok", text: `${tr.platformNames[connected]} bağlandı.` });
    if (authError || connected) {
      handledQuery.current = true;
      const clean = new URLSearchParams(params);
      clean.delete("authError");
      clean.delete("connected");
      clean.delete("platform");
      router.replace(`/transfer${clean.size ? `?${clean}` : ""}`);
    }
  }, [params, router]);

  useEffect(() => {
    let cancelled = false;
    if (!jobId) {
      setJob(null);
      setMissing(false);
      return;
    }
    loadJob(jobId).then((j) => {
      if (cancelled) return;
      setJob(j ?? null);
      setMissing(!j);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  /** UI'dan yapılan değişiklikler: kopyala → değiştir → kaydet → göster. */
  const update = useCallback(
    async (mutate: (j: TransferJob) => void) => {
      if (!job) return;
      const next = structuredClone(job);
      mutate(next);
      await saveJob(next);
      setJob(next);
    },
    [job],
  );

  const startPlatformJob = useCallback(
    async (source: PlatformId) => {
      const j = createJob(source);
      await saveJob(j);
      router.push(`/transfer?job=${j.id}`);
    },
    [router],
  );

  // Kaynak seçerken OAuth'a gidip dönüldüyse (?pick=spotify) işi otomatik başlat.
  const pick = params.get("pick");
  useEffect(() => {
    if (!pick || !platforms || jobId) return;
    const p = platforms.find((x) => x.id === pick);
    if (p?.connected) void startPlatformJob(p.id);
  }, [pick, platforms, jobId, startPlatformJob]);

  async function startFileJob(collections: ImportedCollection[], label: string) {
    const j = createJob("file", label);
    collections.forEach((c, i) => {
      for (const t of c.tracks) j.tracks[t.id] = t;
      j.collections.push({
        key: `file:${i}`,
        sourceId: `file:${i}`,
        name: c.name,
        kind: c.kind,
        trackCount: c.tracks.length,
        selected: true,
        trackKeys: c.tracks.map((t) => t.id),
        loadCursor: null,
        loaded: true,
        progress: 0,
        done: false,
      });
    });
    await saveJob(j);
    router.push(`/transfer?job=${j.id}`);
  }

  const onError = useCallback((text: string) => setMessage({ tone: "bad", text }), []);
  const refreshVoid = useCallback(() => void refresh(), [refresh]);

  const current: JobPhase | "source" = job ? job.phase : "source";

  return (
    <div className="space-y-6">
      <nav aria-label="Adımlar">
        <ol className="flex gap-1 overflow-x-auto text-xs sm:text-sm">
          {STEPS.map((s, i) => {
            const active = i === stepIndex(current);
            const done = i < stepIndex(current);
            return (
              <li
                key={s.id}
                aria-current={active ? "step" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 ${
                  active ? "bg-accent text-accent-fg" : done ? "bg-surface-2 text-fg" : "text-muted"
                }`}
              >
                <span className="tabular-nums">{done ? "✓" : i + 1}</span>
                {s.label}
              </li>
            );
          })}
        </ol>
      </nav>

      {message && (
        <div onClick={() => setMessage(null)}>
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      {!platforms ? (
        <div className="flex items-center gap-2 text-muted">
          <Spinner /> Yükleniyor…
        </div>
      ) : jobId && missing ? (
        <Alert tone="bad" title="Aktarım bulunamadı">
          Bu aktarım bu tarayıcıda kayıtlı değil. Aktarım durumu yalnızca başlatıldığı tarayıcıda saklanır.{" "}
          <a className="underline" href="/transfer">
            Yeni aktarım başlatın
          </a>
          .
        </Alert>
      ) : jobId && !job ? (
        <div className="flex items-center gap-2 text-muted">
          <Spinner /> Aktarım yükleniyor…
        </div>
      ) : !job ? (
        <SourceStep
          platforms={platforms}
          mode={mode}
          onPickPlatform={(id) => void startPlatformJob(id)}
          onImported={(c, label) => void startFileJob(c, label)}
          refresh={refreshVoid}
          onError={onError}
        />
      ) : job.phase === "select" ? (
        <SelectStep job={job} platforms={platforms} update={update} onError={onError} refresh={refreshVoid} />
      ) : job.phase === "target" ? (
        <TargetStep job={job} platforms={platforms} update={update} refresh={refreshVoid} onError={onError} />
      ) : job.phase === "match" || job.phase === "review" ? (
        <MatchStep job={job} setJob={setJob} platforms={platforms} update={update} refresh={refreshVoid} onError={onError} />
      ) : job.phase === "transfer" ? (
        <TransferStep job={job} setJob={setJob} platforms={platforms} refresh={refreshVoid} onError={onError} />
      ) : (
        <ReportStep job={job} />
      )}
    </div>
  );
}
