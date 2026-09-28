"use client";

import { useCallback, useEffect, useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import { platformName } from "@/components/PlatformLogo";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { api, ClientApiError } from "@/lib/client/api";
import type { JobCollection, TransferJob } from "@/lib/client/job";
import type { PlatformStatus } from "@/lib/platform-status";
import { isPlatformId, type PlaylistSummary } from "@/lib/types";

function toCollection(p: PlaylistSummary): JobCollection {
  return {
    key: `${p.kind}:${p.id}`,
    sourceId: p.id,
    name: p.name,
    kind: p.kind,
    trackCount: p.trackCount,
    warning: p.warning,
    selected: false,
    trackKeys: [],
    loadCursor: null,
    loaded: false,
    progress: 0,
    done: false,
  };
}

export function SelectStep({
  job,
  platforms,
  update,
  onError,
  refresh,
}: {
  job: TransferJob;
  platforms: PlatformStatus[];
  update: (mutate: (j: TransferJob) => void) => Promise<void>;
  onError: (m: string) => void;
  refresh: () => void;
}) {
  const source = isPlatformId(job.source) ? platforms.find((p) => p.id === job.source) : undefined;
  const needsConnect = source && !source.connected;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const loadPlaylists = useCallback(async () => {
    if (!source) return;
    setLoading(true);
    setError(null);
    try {
      const all: PlaylistSummary[] = [];
      let cursor: string | null = null;
      do {
        const page = await api.playlists(source.id, cursor);
        all.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      await update((j) => {
        const previous = new Map(j.collections.map((c) => [c.key, c]));
        j.collections = all.map((p) => {
          const fresh = toCollection(p);
          return previous.has(fresh.key) ? { ...fresh, selected: previous.get(fresh.key)!.selected } : fresh;
        });
      });
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Listeler alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [source, update]);

  const shouldLoad = Boolean(source?.connected) && job.collections.length === 0;
  useEffect(() => {
    if (shouldLoad) void loadPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLoad]);

  if (needsConnect && source) {
    return (
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{source.name} hesabınıza bağlanın</h2>
        <p className="text-sm text-muted">Listelerinizi görebilmek için {source.name} erişim izni gerekiyor.</p>
        <ConnectButton platform={source} returnTo={`/transfer?job=${job.id}`} onConnected={refresh} onError={onError} />
      </Card>
    );
  }

  const selectedCount = job.collections.filter((c) => c.selected).length;
  const visible = job.collections.filter((c) => c.name.toLocaleLowerCase("tr").includes(filter.toLocaleLowerCase("tr")));
  const allVisibleSelected = visible.length > 0 && visible.every((c) => c.selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Aktarılacak listeleri seçin</h1>
          <p className="text-sm text-muted">
            Kaynak: {platformName(job.source)}
            {job.sourceLabel ? ` (${job.sourceLabel})` : ""}
          </p>
        </div>
        {source && (
          <Button size="sm" variant="ghost" onClick={loadPlaylists} loading={loading}>
            Yenile
          </Button>
        )}
      </div>

      {error && <Alert tone="bad">{error}</Alert>}

      {loading && job.collections.length === 0 ? (
        <div className="flex items-center gap-2 text-muted">
          <Spinner /> Listeler yükleniyor…
        </div>
      ) : (
        <Card className="p-0 sm:p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={allVisibleSelected}
                onChange={() =>
                  update((j) => {
                    const keys = new Set(visible.map((c) => c.key));
                    for (const c of j.collections) if (keys.has(c.key)) c.selected = !allVisibleSelected;
                  })
                }
              />
              Tümünü seç
            </label>
            <input
              type="search"
              placeholder="Liste ara…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-sm"
            />
          </div>
          <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto">
            {visible.map((c) => (
              <li key={c.key}>
                <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                    checked={c.selected}
                    onChange={() =>
                      update((j) => {
                        const target = j.collections.find((x) => x.key === c.key);
                        if (target) target.selected = !target.selected;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.kind === "liked" && <Badge tone="accent">Beğenilenler</Badge>}
                    </span>
                    {c.warning && <span className="mt-0.5 block text-xs text-warn">{c.warning}</span>}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted">
                    {c.trackCount ?? c.trackKeys.length ?? "?"} şarkı
                  </span>
                </label>
              </li>
            ))}
            {visible.length === 0 && <li className="p-4 text-sm text-muted">Liste bulunamadı.</li>}
          </ul>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={selectedCount === 0}
          onClick={() =>
            update((j) => {
              j.phase = "target";
            })
          }
        >
          {selectedCount} liste ile devam
        </Button>
      </div>
    </div>
  );
}
