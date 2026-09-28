import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Providers } from "@/components/Providers";
import { ThemeToggle } from "@/components/ThemeToggle";
import { tr } from "@/lib/i18n/tr";
import "./globals.css";

export const metadata: Metadata = {
  title: tr.appName,
  description: tr.tagline,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1013" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Providers>
          <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-fg">
                  ♫
                </span>
                <span className="truncate">{tr.appName}</span>
              </Link>
              <ThemeToggle />
            </div>
          </header>
          <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">{children}</main>
          <footer className="mx-auto max-w-4xl px-4 pb-8 text-xs text-muted">
            Oturum bilgileriniz yalnızca şifreli, HTTP-only çerezlerde tutulur. Aktarım durumu bu tarayıcıda saklanır.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
