"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

// Uygulama genelinde kullanılan küçük arayüz bileşenleri.

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "border border-border bg-surface hover:bg-surface-2",
  ghost: "hover:bg-surface-2",
  danger: "border border-bad/40 text-bad hover:bg-bad/10",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  const sizes = size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4";
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${variants[variant]} ${className}`}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-muted">
        <span>{label}</span>
        <span className="tabular-nums">
          {value.toLocaleString("tr-TR")} / {max.toLocaleString("tr-TR")} (%{pct})
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
  accent: "bg-accent/15 text-accent",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Alert({ tone = "warn", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const border: Record<Tone, string> = {
    neutral: "border-border",
    ok: "border-ok/40",
    warn: "border-warn/40",
    bad: "border-bad/40",
    accent: "border-accent/40",
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-lg border ${border[tone]} bg-surface p-3 text-sm`}>
      {title && <p className={`mb-1 font-semibold ${tones[tone].split(" ")[1]}`}>{title}</p>}
      <div className="text-fg/90">{children}</div>
    </div>
  );
}
