"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TransferJob } from "@/lib/client/job";
import { StopError, type RunCallbacks } from "@/lib/client/orchestrator";

export type Task = (job: TransferJob, cb: RunCallbacks) => Promise<void>;

/**
 * Uzun süren orkestratör görevlerini çalıştırır; duraklatma, bekleme sayacı ve
 * durdurma nedenini yönetir. Önceki çalışma tamamen bitmeden yenisi başlamaz;
 * böylece aynı parti iki kez gönderilip kopya oluşmaz.
 */
export function useRunner(job: TransferJob, setJob: (j: TransferJob) => void) {
  const [running, setRunning] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [stop, setStop] = useState<StopError | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const latest = useRef(job);
  latest.current = job;

  const run = useCallback(
    async (task: Task) => {
      if (busy.current) return;
      busy.current = true;
      const ctrl = new AbortController();
      controller.current = ctrl;
      setRunning(true);
      setStop(null);
      const working = structuredClone(latest.current);
      try {
        await task(working, {
          signal: ctrl.signal,
          onUpdate: (j) => {
            latest.current = j;
            setJob(j);
          },
          onWait: setWaitSeconds,
        });
      } catch (err) {
        setStop(err instanceof StopError ? err : new StopError("error", (err as Error).message ?? "Bilinmeyen hata"));
      } finally {
        busy.current = false;
        setRunning(false);
        setPausing(false);
        setWaitSeconds(0);
      }
    },
    [setJob],
  );

  const pause = useCallback(() => {
    setPausing(true);
    controller.current?.abort();
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  return { run, pause, running, pausing, waitSeconds, stop };
}

/** Bileşen açıldığında görevi bir kez otomatik başlatır (StrictMode'da çift çalışmayı önler). */
export function useAutoStart(enabled: boolean, start: () => void) {
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => startRef.current(), 0);
    return () => clearTimeout(t);
  }, [enabled]);
}
