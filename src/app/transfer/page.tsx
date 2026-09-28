import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { TransferWizard } from "@/components/wizard/TransferWizard";

export const metadata: Metadata = { title: "Aktarım · Müzik Listesi Aktarıcı" };

export default function TransferPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-muted">
          <Spinner /> Yükleniyor…
        </div>
      }
    >
      <TransferWizard />
    </Suspense>
  );
}
