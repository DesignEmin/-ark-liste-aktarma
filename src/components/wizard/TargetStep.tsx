"use client";

import { ConnectButton, DisconnectButton } from "@/components/ConnectButton";
import { PlatformLogo } from "@/components/PlatformLogo";
import { Alert, Badge, Button, Card } from "@/components/ui";
import type { TransferJob } from "@/lib/client/job";
import { estimateQuota } from "@/lib/client/orchestrator";
import type { PlatformStatus } from "@/lib/platform-status";
import type { PlatformId } from "@/lib/types";

export function TargetStep({
  job,
  platforms,
  update,
  refresh,
  onError,
}: {
  job: TransferJob;
  platforms: PlatformStatus[];
  update: (mutate: (j: TransferJob) => void) => Promise<void>;
  refresh: () => void;
  onError: (m: string) => void;
}) {
  const options = platforms.filter((p) => p.id !== job.source);
  const chosen = options.find((p) => p.id === job.target);
  const quota = chosen ? estimateQuota(job, chosen.capabilities) : null;

  const choose = (id: PlatformId) =>
    update((j) => {
      if (j.target !== id) {
        // Hedef değişirse önceki eşleştirmeler geçersizdir.
        j.matches = {};
        j.matchAttempts = {};
      }
      j.target = id;
    });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Şarkılar nereye aktarılsın?</h1>
        <p className="text-sm text-muted">Hedef platformu seçin ve hesabınıza bağlanın.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((p) => {
          const selected = job.target === p.id;
          return (
            <Card key={p.id} className={`flex flex-col gap-3 ${selected ? "ring-2 ring-accent" : ""}`}>
              <button
                className="flex items-center gap-3 text-left disabled:opacity-50"
                disabled={!p.configured}
                onClick={() => choose(p.id)}
                aria-pressed={selected}
              >
                <PlatformLogo id={p.id} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {!p.configured ? "Sunucuda API anahtarı tanımlı değil" : p.connected ? `Bağlı: ${p.userName ?? ""}` : "Bağlı değil"}
                  </span>
                </span>
                {selected && <Badge tone="accent">Seçili</Badge>}
              </button>
              {p.configured && (
                <div className="flex flex-wrap gap-2">
                  {p.connected ? (
                    <DisconnectButton platform={p} onDone={refresh} />
                  ) : (
                    <ConnectButton
                      platform={p}
                      variant={selected ? "primary" : "secondary"}
                      returnTo={`/transfer?job=${job.id}`}
                      onConnected={() => {
                        void choose(p.id);
                        refresh();
                      }}
                      onError={onError}
                    />
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {quota && (
        <Alert tone={quota.total > quota.daily ? "warn" : "neutral"} title="YouTube kota tahmini">
          Bu aktarım yaklaşık <b>{quota.total.toLocaleString("tr-TR")}</b> birim kullanacak (eşleştirme{" "}
          {quota.matching.toLocaleString("tr-TR")}, ekleme {quota.transfer.toLocaleString("tr-TR")}). Günlük varsayılan
          kota {quota.daily.toLocaleString("tr-TR")} birimdir; her şarkı araması 100 birim tutar.
          {quota.total > quota.daily &&
            " Kota dolduğunda işlem duraklatılır; ertesi gün bu sayfaya dönüp kaldığı yerden devam edebilirsiniz."}
        </Alert>
      )}

      <div className="flex justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() =>
            update((j) => {
              j.phase = "select";
            })
          }
        >
          Geri
        </Button>
        <Button
          variant="primary"
          disabled={!chosen?.connected}
          onClick={() =>
            update((j) => {
              j.phase = "match";
            })
          }
        >
          Eşleştirmeyi başlat
        </Button>
      </div>
    </div>
  );
}
