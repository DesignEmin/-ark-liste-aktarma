"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, Progress } from "@/components/ui";
import { matchStats, selectedCollections, selectedTrackKeys, type TransferJob } from "@/lib/client/job";
import { saveJob } from "@/lib/client/job-store";
import { applyChoice, loadSourceTracks, rememberChoice, runMatching } from "@/lib/client/orchestrator";
import { formatDuration, tr } from "@/lib/i18n/tr";
import type { PlatformStatus } from "@/lib/platform-status";
import type { MatchResult, MatchStatus, Track } from "@/lib/types";
import { RunStatus } from "./RunStatus";
import { useAutoStart, useRunner, type Task } from "./useRunner";

interface StepProps {
  job: TransferJob;
  setJob: (j: TransferJob) => void;
  platforms: PlatformStatus[];
  update: (mutate: (j: TransferJob) => void) => Promise<void>;
  refresh: () => void;
  onError: (m: string) => void;
}

export function MatchStep(props: StepProps) {
  const { job, setJob, platforms } = props;
  const target = platforms.find((p) => p.id === job.target);
  const runner = useRunner(job, setJob);

  const task: Task = async (working, cb) => {
    if (!target) throw new Error("Hedef platform seçilmedi.");
    await loadSourceTracks(working, cb);
    await runMatching(working, target.capabilities, cb);
    working.phase = "review";
    await saveJob(working);
    cb.onUpdate({ ...working });
  };
  useAutoStart(job.phase === "match" && Boolean(target), () => void runner.run(task));

  if (job.phase === "review") return <ReviewPanel {...props} />;

  const cols = selectedCollections(job);
  const loaded = cols.reduce((n, c) => n + c.trackKeys.length, 0);
  const expected = cols.reduce((n, c) => n + Math.max(c.trackCount ?? 0, c.trackKeys.length), 0);
  const allLoaded = cols.every((c) => c.loaded);
  const stats = matchStats(job);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Şarkılar eşleştiriliyor</h1>
        <p className="text-sm text-muted">
          Önce ISRC koduyla, bulunamazsa sanatçı ve şarkı adıyla arama yapılıyor. Sayfayı kapatsanız bile ilerleme kaydedilir.
        </p>
      </div>
      <Card className="space-y-4">
        <Progress label="Kaynak şarkılar okunuyor" value={loaded} max={allLoaded ? loaded : Math.max(expected, loaded)} />
        <Progress label="Eşleştirme" value={stats.total - stats.pending} max={stats.total} />
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone="ok">
            {tr.status.matched}: {stats.matched}
          </Badge>
          <Badge tone="warn">
            {tr.status.uncertain}: {stats.uncertain}
          </Badge>
          <Badge tone="bad">
            {tr.status.notFound}: {stats.notFound}
          </Badge>
        </div>
        {cols.some((c) => c.loadError) && (
          <ul className="text-sm text-warn">
            {cols
              .filter((c) => c.loadError)
              .map((c) => (
                <li key={c.key}>
                  “{c.name}” okunamadı: {c.loadError}
                </li>
              ))}
          </ul>
        )}
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
        refresh={props.refresh}
        onError={props.onError}
      />
    </div>
  );
}

const PAGE = 50;

function ReviewPanel({ job, update }: StepProps) {
  const [tab, setTab] = useState<MatchStatus>("uncertain");
  const [limit, setLimit] = useState(PAGE);
  const [query, setQuery] = useState("");
  const stats = matchStats(job);

  const keys = useMemo(() => selectedTrackKeys(job), [job]);
  const inTab = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return keys.filter((k) => {
      const m = job.matches[k];
      if (!m || m.status !== tab) return false;
      if (!q) return true;
      const t = job.tracks[k];
      return `${t.artists.join(" ")} ${t.title}`.toLocaleLowerCase("tr").includes(q);
    });
  }, [keys, job, tab, query]);

  const choose = async (key: string, id: string | null) => {
    let updated: TransferJob | undefined;
    await update((j) => {
      applyChoice(j, key, id);
      updated = j;
    });
    if (id && updated) void rememberChoice(updated, key);
  };

  const bulk = (mode: "best" | "skip") =>
    update((j) => {
      for (const k of inTab) {
        const best = j.matches[k]?.candidates[0];
        applyChoice(j, k, mode === "best" && best ? best.track.id : null);
      }
    });

  const tabs: Array<{ id: MatchStatus; label: string; count: number; tone: "ok" | "warn" | "bad" }> = [
    { id: "matched", label: "Bulunanlar", count: stats.matched, tone: "ok" },
    { id: "uncertain", label: "Emin olunamayanlar", count: stats.uncertain, tone: "warn" },
    { id: "notFound", label: "Bulunamayanlar", count: stats.notFound, tone: "bad" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Eşleşmeleri kontrol edin</h1>
        <p className="text-sm text-muted">
          {stats.total} şarkıdan <b>{stats.selected}</b> tanesi aktarılacak. Emin olunamayanlarda doğru şarkıyı seçin ya da
          atlayın.
        </p>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setLimit(PAGE);
            }}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-surface-2 font-medium" : "text-muted hover:text-fg"
            }`}
          >
            {t.label} <Badge tone={t.tone}>{t.count}</Badge>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Şarkı veya sanatçı ara…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 min-w-0 flex-1 basis-full rounded-md border border-border bg-surface px-3 text-sm sm:basis-auto"
        />
        {tab !== "matched" && inTab.length > 0 && (
          <>
            <Button size="sm" onClick={() => bulk("best")}>
              En iyi adayları seç
            </Button>
            <Button size="sm" variant="ghost" onClick={() => bulk("skip")}>
              Tümünü atla
            </Button>
          </>
        )}
      </div>

      <ul className="space-y-2">
        {inTab.slice(0, limit).map((k) => (
          <MatchRow key={k} track={job.tracks[k]} match={job.matches[k]} onChoose={(id) => void choose(k, id)} />
        ))}
        {inTab.length === 0 && <li className="p-4 text-center text-sm text-muted">Bu sekmede şarkı yok.</li>}
      </ul>
      {inTab.length > limit && (
        <div className="text-center">
          <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Daha fazla göster ({inTab.length - limit})
          </Button>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex justify-between gap-2 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur">
        <Button
          variant="ghost"
          onClick={() =>
            update((j) => {
              j.phase = "target";
            })
          }
        >
          Geri
        </Button>
        <Button
          variant="primary"
          disabled={stats.selected === 0}
          onClick={() =>
            update((j) => {
              j.phase = "transfer";
            })
          }
        >
          {stats.selected} şarkıyı aktar
        </Button>
      </div>
    </div>
  );
}

function TrackLine({ track, muted }: { track: Track; muted?: boolean }) {
  return (
    <span className={`block min-w-0 ${muted ? "text-muted" : ""}`}>
      <span className="block truncate font-medium">{track.title}</span>
      <span className="block truncate text-xs text-muted">
        {track.artists.join(", ") || "Bilinmeyen sanatçı"}
        {track.album ? ` · ${track.album}` : ""}
        {track.durationMs ? ` · ${formatDuration(track.durationMs)}` : ""}
      </span>
    </span>
  );
}

function MatchRow({ track, match, onChoose }: { track: Track; match: MatchResult; onChoose: (id: string | null) => void }) {
  const [open, setOpen] = useState(match.status !== "matched");
  const selected = match.candidates.find((c) => c.track.id === match.selectedId);
  const name = `choice-${track.id}`;

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <TrackLine track={track} />
          {track.isrc && <span className="text-[10px] uppercase tracking-wide text-muted">ISRC {track.isrc}</span>}
        </div>
        <span aria-hidden className="pt-1 text-muted">
          →
        </span>
        <div className="min-w-0 flex-1">
          {selected ? (
            <TrackLine track={selected.track} />
          ) : (
            <span className="text-sm text-muted">{match.candidates.length ? "Seçilmedi (atlanacak)" : "Aday yok"}</span>
          )}
        </div>
      </div>

      {match.candidates.length > 0 && (
        <div className="mt-2">
          <button className="text-xs text-accent underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Adayları gizle" : `Adayları göster (${match.candidates.length})`}
          </button>
          {open && (
            <fieldset className="mt-2 space-y-1">
              <legend className="sr-only">{track.title} için aday seçin</legend>
              {match.candidates.map((c) => (
                <label
                  key={c.track.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-surface-2"
                >
                  <input
                    type="radio"
                    name={name}
                    className="h-4 w-4 accent-[var(--accent)]"
                    checked={match.selectedId === c.track.id}
                    onChange={() => onChoose(c.track.id)}
                  />
                  <TrackLine track={c.track} />
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    {c.via === "isrc" && <Badge tone="accent">ISRC</Badge>}
                    <Badge tone={c.score >= 0.85 ? "ok" : c.score >= 0.55 ? "warn" : "bad"}>%{Math.round(c.score * 100)}</Badge>
                    {c.track.url && (
                      <a
                        href={c.track.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Aç
                      </a>
                    )}
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-surface-2">
                <input
                  type="radio"
                  name={name}
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={match.selectedId === null}
                  onChange={() => onChoose(null)}
                />
                <span className="text-sm">Bu şarkıyı atla</span>
              </label>
            </fieldset>
          )}
        </div>
      )}
    </li>
  );
}
