import type { MatchResult, PlatformId, SourceKind, Track } from "@/lib/types";

// Bir aktarım işinin tüm durumu. Her adımdan sonra IndexedDB'ye yazılır;
// sayfa kapansa bile iş kaldığı yerden devam edebilir.

export type JobPhase = "select" | "target" | "match" | "review" | "transfer" | "done";

export interface JobCollection {
  /** İş içindeki benzersiz anahtar */
  key: string;
  /** Kaynaktaki liste kimliği (dosyada "file:n") */
  sourceId: string;
  name: string;
  kind: "playlist" | "liked";
  trackCount?: number;
  selected: boolean;
  warning?: string;

  /** Kaynak şarkıları (job.tracks anahtarları), kaynaktaki sırayla */
  trackKeys: string[];
  /** Kaynaktan okuma devam ediyorsa sonraki sayfanın imleci */
  loadCursor: string | null;
  loaded: boolean;
  loadError?: string;

  // ── Aktarım durumu ──
  /** Aktarım başlarken dondurulan hedef şarkı kimlikleri */
  plan?: string[];
  /** plan içinde kaçıncı şarkıya kadar aktarıldı */
  progress: number;
  targetPlaylistId?: string;
  targetUrl?: string;
  done: boolean;
}

export interface TransferJob {
  id: string;
  createdAt: number;
  updatedAt: number;
  phase: JobPhase;
  source: SourceKind;
  /** Dosyadan içe aktarmada dosya adı */
  sourceLabel?: string;
  target: PlatformId | null;
  collections: JobCollection[];
  /** Kaynak şarkılar, anahtar = kaynak kimliği */
  tracks: Record<string, Track>;
  /** Eşleştirme sonuçları, anahtar = kaynak kimliği */
  matches: Record<string, MatchResult>;
  /** Geçici hatalar nedeniyle kaç kez denendi */
  matchAttempts: Record<string, number>;
  finishedAt?: number;
}

export function newJobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createJob(source: SourceKind, sourceLabel?: string): TransferJob {
  const now = Date.now();
  return {
    id: newJobId(),
    createdAt: now,
    updatedAt: now,
    phase: "select",
    source,
    sourceLabel,
    target: null,
    collections: [],
    tracks: {},
    matches: {},
    matchAttempts: {},
  };
}

export function selectedCollections(job: TransferJob): JobCollection[] {
  return job.collections.filter((c) => c.selected);
}

/** Seçili listelerdeki tekil şarkı anahtarları */
export function selectedTrackKeys(job: TransferJob): string[] {
  const set = new Set<string>();
  for (const c of selectedCollections(job)) for (const k of c.trackKeys) set.add(k);
  return [...set];
}

/** Bir listenin hedefe aktarılacak şarkı kimlikleri (atlananlar hariç, tekrarsız, sıralı). */
export function planFor(job: TransferJob, c: JobCollection): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of c.trackKeys) {
    const id = job.matches[key]?.selectedId;
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export interface MatchStats {
  total: number;
  matched: number;
  uncertain: number;
  notFound: number;
  pending: number;
  selected: number;
}

export function matchStats(job: TransferJob): MatchStats {
  const keys = selectedTrackKeys(job);
  const s: MatchStats = { total: keys.length, matched: 0, uncertain: 0, notFound: 0, pending: 0, selected: 0 };
  for (const k of keys) {
    const m = job.matches[k];
    if (!m) s.pending++;
    else {
      s[m.status]++;
      if (m.selectedId) s.selected++;
    }
  }
  return s;
}

export function transferProgress(job: TransferJob): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const c of selectedCollections(job)) {
    const plan = c.plan ?? planFor(job, c);
    total += plan.length + (c.kind === "playlist" ? 1 : 0); // +1: listenin oluşturulması
    done += Math.min(c.progress, plan.length) + (c.kind === "playlist" && c.targetPlaylistId ? 1 : 0);
  }
  return { done, total };
}
