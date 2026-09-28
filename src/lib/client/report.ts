import type { Track } from "@/lib/types";
import { planFor, selectedCollections, type TransferJob } from "./job";

export interface CollectionReport {
  key: string;
  name: string;
  kind: "playlist" | "liked";
  sourceCount: number;
  transferred: number;
  planned: number;
  notFound: Track[];
  skipped: Track[];
  url?: string;
  loadError?: string;
}

export interface TransferReport {
  collections: CollectionReport[];
  totals: { source: number; transferred: number; notFound: number; skipped: number };
}

export function buildReport(job: TransferJob): TransferReport {
  const collections: CollectionReport[] = selectedCollections(job).map((c) => {
    const notFound: Track[] = [];
    const skipped: Track[] = [];
    const seen = new Set<string>();
    for (const key of c.trackKeys) {
      if (seen.has(key)) continue;
      seen.add(key);
      const m = job.matches[key];
      const track = job.tracks[key];
      if (!track || m?.selectedId) continue;
      if (!m || m.status === "notFound") notFound.push(track);
      else skipped.push(track); // aday vardı ama kullanıcı seçmedi / atladı
    }
    const plan = c.plan ?? planFor(job, c);
    return {
      key: c.key,
      name: c.name,
      kind: c.kind,
      sourceCount: seen.size,
      planned: plan.length,
      transferred: Math.min(c.progress, plan.length),
      notFound,
      skipped,
      url: c.targetUrl,
      loadError: c.loadError,
    };
  });

  const totals = collections.reduce(
    (t, c) => ({
      source: t.source + c.sourceCount,
      transferred: t.transferred + c.transferred,
      notFound: t.notFound + c.notFound.length,
      skipped: t.skipped + c.skipped.length,
    }),
    { source: 0, transferred: 0, notFound: 0, skipped: 0 },
  );
  return { collections, totals };
}

function csvCell(value: string | number | undefined): string {
  const s = value === undefined ? "" : String(value);
  // Excel'de formül enjeksiyonunu önle
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Bulunamayan (ve atlanan) şarkıları CSV'ye dönüştürür. Excel için UTF-8 BOM eklenir. */
export function reportToCsv(report: TransferReport): string {
  const rows: string[][] = [["Liste", "Sanatçı", "Şarkı", "Albüm", "ISRC", "Süre (sn)", "Durum"]];
  for (const c of report.collections) {
    const push = (t: Track, status: string) =>
      rows.push([
        c.name,
        t.artists.join(", "),
        t.title,
        t.album ?? "",
        t.isrc ?? "",
        t.durationMs ? String(Math.round(t.durationMs / 1000)) : "",
        status,
      ]);
    c.notFound.forEach((t) => push(t, "Bulunamadı"));
    c.skipped.forEach((t) => push(t, "Atlandı"));
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function downloadText(fileName: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
