"use client";

import { useEffect } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import { Alert, Button } from "@/components/ui";
import type { TransferJob } from "@/lib/client/job";
import type { StopError } from "@/lib/client/orchestrator";
import { formatSeconds, tr } from "@/lib/i18n/tr";
import type { PlatformStatus } from "@/lib/platform-status";

/** Çalışma durumu: bekleme sayacı, duraklatma ve durma nedenleri. */
export function RunStatus({
  job,
  platforms,
  running,
  pausing,
  waitSeconds,
  stop,
  onPause,
  onResume,
  refresh,
  onError,
}: {
  job: TransferJob;
  platforms: PlatformStatus[];
  running: boolean;
  pausing: boolean;
  waitSeconds: number;
  stop: StopError | null;
  onPause: () => void;
  onResume: () => void;
  refresh: () => void;
  onError: (m: string) => void;
}) {
  // Oturum hatasında hangi platformun bağlantısının koptuğunu görmek için durumu tazele.
  useEffect(() => {
    if (stop?.reason === "auth") refresh();
  }, [stop, refresh]);

  const involved = platforms.filter((p) => p.id === job.source || p.id === job.target);
  const disconnected = involved.filter((p) => !p.connected);

  return (
    <div className="space-y-3">
      {running && waitSeconds > 0 && (
        <Alert tone="neutral" title="İstek sınırına ulaşıldı">
          Platform kısa süreliğine bekleme istedi. {formatSeconds(waitSeconds)} sonra otomatik devam edilecek.
        </Alert>
      )}

      {!running && stop?.reason === "quota" && (
        <Alert tone="warn" title="Kota doldu">
          {stop.message}
          {stop.retryAfter ? ` Tahmini bekleme: ${formatSeconds(stop.retryAfter)}.` : ""} {tr.errors.quota}
        </Alert>
      )}

      {!running && stop?.reason === "auth" && (
        <Alert tone="warn" title="Yeniden bağlanın">
          <p>{tr.errors.auth}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(disconnected.length ? disconnected : involved).map((p) => (
              <ConnectButton key={p.id} platform={p} returnTo={`/transfer?job=${job.id}`} onConnected={refresh} onError={onError} />
            ))}
          </div>
        </Alert>
      )}

      {!running && stop?.reason === "error" && (
        <Alert tone="bad" title="Bir hata oluştu">
          {stop.message}
        </Alert>
      )}

      {!running && stop?.reason === "aborted" && <Alert tone="neutral">İşlem duraklatıldı. İlerleme kaydedildi.</Alert>}

      <div className="flex flex-wrap gap-2">
        {running ? (
          <Button onClick={onPause} loading={pausing}>
            {pausing ? "Duraklatılıyor…" : tr.actions.pause}
          </Button>
        ) : (
          <Button variant={stop?.reason === "auth" ? "secondary" : "primary"} onClick={onResume}>
            {tr.actions.resume}
          </Button>
        )}
      </div>
    </div>
  );
}
