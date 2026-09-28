"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
  { value: "light", label: "Açık", icon: "☀" },
  { value: "dark", label: "Koyu", icon: "☾" },
  { value: "system", label: "Sistem", icon: "◐" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div role="radiogroup" aria-label="Tema" className="flex rounded-lg border border-border bg-surface p-0.5 text-sm">
      {OPTIONS.map((o) => {
        const active = mounted && theme === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            title={o.label}
            onClick={() => setTheme(o.value)}
            className={`rounded-md px-2 py-1 transition-colors ${
              active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
            }`}
          >
            <span aria-hidden>{o.icon}</span>
            <span className="sr-only">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
