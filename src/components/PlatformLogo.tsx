import { platformColors, tr } from "@/lib/i18n/tr";
import type { SourceKind } from "@/lib/types";

const LETTERS: Record<SourceKind, string> = { spotify: "S", youtube: "▶", apple: "♪", deezer: "D", file: "⇪" };

/** Marka logosu yerine sade, renkli bir simge. */
export function PlatformLogo({ id, size = 32 }: { id: SourceKind; size?: number }) {
  const color = id === "file" ? "var(--muted)" : platformColors[id];
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-lg font-bold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.45 }}
    >
      {LETTERS[id]}
    </span>
  );
}

export function platformName(id: SourceKind): string {
  return id === "file" ? "Dosya" : tr.platformNames[id];
}
