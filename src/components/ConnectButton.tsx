"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { connectAppleMusic } from "@/lib/client/musickit";
import type { PlatformStatus } from "@/lib/platform-status";
import { tr } from "@/lib/i18n/tr";
import { Button } from "./ui";

/** Platforma bağlanır: OAuth için yönlendirir, Apple için MusicKit penceresini açar. */
export function ConnectButton({
  platform,
  returnTo,
  onConnected,
  onError,
  variant = "primary",
}: {
  platform: PlatformStatus;
  returnTo: string;
  onConnected: () => void;
  onError: (message: string) => void;
  variant?: "primary" | "secondary";
}) {
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (platform.capabilities.authMode === "musickit") {
      setBusy(true);
      try {
        await connectAppleMusic();
        onConnected();
      } catch (err) {
        onError((err as Error).message || "Apple Music bağlantısı kurulamadı.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    window.location.href = api.loginUrl(platform.id, returnTo);
  }

  return (
    <Button variant={variant} size="sm" onClick={connect} loading={busy} disabled={!platform.configured}>
      {platform.name} {tr.actions.connect.toLowerCase()}
    </Button>
  );
}

export function DisconnectButton({ platform, onDone }: { platform: PlatformStatus; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.logout(platform.id);
        } finally {
          setBusy(false);
          onDone();
        }
      }}
    >
      {tr.actions.disconnect}
    </Button>
  );
}
