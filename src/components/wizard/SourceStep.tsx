"use client";

import { ConnectButton, DisconnectButton } from "@/components/ConnectButton";
import { FileImport } from "@/components/FileImport";
import { PlatformLogo } from "@/components/PlatformLogo";
import { Badge, Button, Card } from "@/components/ui";
import type { ImportedCollection } from "@/lib/import";
import type { PlatformStatus } from "@/lib/platform-status";
import type { PlatformId } from "@/lib/types";

export function SourceStep({
  platforms,
  mode,
  onPickPlatform,
  onImported,
  refresh,
  onError,
}: {
  platforms: PlatformStatus[];
  mode: "platform" | "file";
  onPickPlatform: (id: PlatformId) => void;
  onImported: (collections: ImportedCollection[], label: string) => void;
  refresh: () => void;
  onError: (m: string) => void;
}) {
  return (
    <div className="space-y-6">
      {mode === "platform" && (
        <section>
          <h1 className="text-xl font-semibold">Şarkılar nereden aktarılsın?</h1>
          <p className="mt-1 text-sm text-muted">Kaynak platformu seçin. Gerekirse hesabınıza bağlanmanız istenir.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {platforms.map((p) => (
              <Card key={p.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <PlatformLogo id={p.id} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted">
                      {!p.configured ? "Sunucuda API anahtarı tanımlı değil" : p.connected ? `Bağlı: ${p.userName ?? ""}` : "Bağlı değil"}
                    </p>
                  </div>
                  {p.connected && <Badge tone="ok">Bağlı</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.connected ? (
                    <>
                      <Button variant="primary" size="sm" onClick={() => onPickPlatform(p.id)}>
                        Kaynak olarak seç
                      </Button>
                      <DisconnectButton platform={p} onDone={refresh} />
                    </>
                  ) : p.configured ? (
                    <ConnectButton
                      platform={p}
                      returnTo={`/transfer?pick=${p.id}`}
                      onConnected={() => onPickPlatform(p.id)}
                      onError={onError}
                    />
                  ) : (
                    <Button size="sm" disabled>
                      Kullanılamıyor
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Kaynak hesabınıza giriş yapmak istemiyor musunuz?{" "}
            <a className="text-accent underline" href="/transfer?mode=file">
              Dosyadan içe aktarın
            </a>
            .
          </p>
        </section>
      )}

      {mode === "file" && (
        <section className="space-y-3">
          <FileImport onImported={onImported} />
          <p className="text-sm text-muted">
            <a className="text-accent underline" href="/transfer">
              Platformdan aktarmak
            </a>{" "}
            için geri dönün.
          </p>
        </section>
      )}
    </div>
  );
}
