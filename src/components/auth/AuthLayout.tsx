import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between bg-ink p-10 text-ink-foreground lg:flex">
        <Link to="/" aria-label="Eminent Clicks home">
          <Logo light />
        </Link>
        <div className="max-w-md">
          <p className="font-display text-3xl font-semibold leading-tight">One login. Pay once. Unlock your tool.</p>
          <p className="mt-4 text-sm leading-relaxed text-ink-foreground/70">
            Business tools for jobs, invoices, subscriptions, financial reports and claims — all from one account.
          </p>
        </div>
        <p className="text-xs text-ink-foreground/50">© {new Date().getFullYear()} Eminent Clicks</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 inline-block lg:hidden" aria-label="Eminent Clicks home">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
