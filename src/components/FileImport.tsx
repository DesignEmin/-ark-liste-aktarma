"use client";

import { useRef, useState } from "react";
import { MAX_IMPORT_BYTES, parseImportFile, type ImportedCollection } from "@/lib/import";
import { Alert, Button, Card } from "./ui";

const FORMAT_LABEL: Record<string, string> = {
  exportify: "Exportify CSV",
  tunemymusic: "TuneMyMusic CSV",
  csv: "CSV",
  text: "Düz metin",
  "spotify-library": "Spotify YourLibrary.json",
  "spotify-playlists": "Spotify Playlist JSON",
  "spotify-history": "Spotify dinleme geçmişi",
};

/** CSV / TXT / Spotify JSON dosyalarını tarayıcıda okur; dosya sunucuya gönderilmez. */
export function FileImport({ onImported }: { onImported: (collections: ImportedCollection[], label: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [collections, setCollections] = useState<ImportedCollection[]>([]);
  const [files, setFiles] = useState<Array<{ name: string; format: string }>>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const newCollections: ImportedCollection[] = [];
    const newFiles: typeof files = [];
    const warnings: string[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_IMPORT_BYTES) {
        warnings.push(`${file.name}: dosya çok büyük (en fazla 50 MB).`);
        continue;
      }
      try {
        const result = parseImportFile(file.name, await file.text());
        newCollections.push(...result.collections.filter((c) => c.tracks.length > 0));
        newFiles.push({ name: file.name, format: FORMAT_LABEL[result.format] ?? result.format });
        warnings.push(...result.warnings.map((w) => `${file.name}: ${w}`));
      } catch (err) {
        warnings.push(`${file.name}: ${(err as Error).message}`);
      }
    }
    if (!newCollections.length && !collections.length) setError("Dosyalarda aktarılabilecek şarkı bulunamadı.");
    setCollections((c) => [...c, ...newCollections]);
    setFiles((f) => [...f, ...newFiles]);
    setMessages((m) => [...m, ...warnings]);
  }

  const total = collections.reduce((n, c) => n + c.tracks.length, 0);

  return (
    <Card>
      <h2 className="text-lg font-semibold">Dosyadan içe aktar</h2>
      <p className="mt-1 text-sm text-muted">
        Kaynak platforma giriş yapmadan aktarım yapın. Desteklenenler: Exportify ve TuneMyMusic CSV, düz metin
        (<code>Sanatçı - Şarkı</code>), Spotify veri indirme JSON dosyaları (YourLibrary.json, Playlist1.json,
        StreamingHistory). Dosyalar tarayıcınızda işlenir, sunucuya yüklenmez.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`mt-4 grid place-items-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        <p className="text-sm text-muted">Dosyaları buraya sürükleyin ya da</p>
        <Button className="mt-2" size="sm" onClick={() => input.current?.click()}>
          Dosya seç
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json"
          className="sr-only"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="bad">{error}</Alert>
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 space-y-2 text-sm">
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-muted">{f.format}</span>
              </li>
            ))}
          </ul>
          <p className="font-medium">
            {collections.length} liste, toplam {total.toLocaleString("tr-TR")} şarkı bulundu.
          </p>
          {messages.length > 0 && (
            <details className="text-muted">
              <summary className="cursor-pointer">{messages.length} uyarı</summary>
              <ul className="mt-1 list-disc pl-5">
                {messages.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="primary"
              disabled={!collections.length}
              onClick={() => onImported(collections, files.map((f) => f.name).join(", "))}
            >
              Devam
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCollections([]);
                setFiles([]);
                setMessages([]);
              }}
            >
              Temizle
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
