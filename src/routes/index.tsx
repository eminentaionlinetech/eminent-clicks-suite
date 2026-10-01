import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { TOOLS, BANK_DETAILS } from "@/lib/tools";
import { formatNaira } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eminent Clicks — Business tools for Nigerian businesses" },
      { name: "description", content: "One login. Pay once by bank transfer. Unlock SubTrack, JobFlow, PayChaser, ReportSnap and ClaimDesk." },
      { property: "og:title", content: "Eminent Clicks — Business tools" },
      { property: "og:description", content: "One login. Pay once. Unlock your tool." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex gap-2">
          <Button asChild variant="ghost"><Link to="/login">Log in</Link></Button>
          <Button asChild><Link to="/register">Create account</Link></Button>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">One login · Pay once · Unlock your tool</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-6xl">Simple tools that keep your business organised.</h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">Track subscriptions, jobs, invoices, profit and claims. Pay by bank transfer, upload your receipt, and we unlock your tool once it's verified.</p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/register">Get started</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/login">I have an account</Link></Button>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <div key={t.id} className="rounded-2xl border bg-card p-6 shadow-card">
            <t.icon className="h-6 w-6 text-primary" />
            <h2 className="mt-4 text-lg font-semibold">{t.name}</h2>
            <p className="text-sm text-muted-foreground">{t.short}</p>
            <ul className="mt-3 space-y-1 text-sm">{t.features.map((f) => <li key={f}>• {f}</li>)}</ul>
            <p className="mt-4 font-display text-xl font-semibold">{formatNaira(t.displayPriceKobo)} <span className="text-sm font-normal text-muted-foreground">one-time</span></p>
          </div>
        ))}
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="rounded-2xl bg-secondary p-8">
          <h2 className="text-xl font-semibold">How payment works</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
            <li>Create your account and choose a tool.</li>
            <li>Transfer to {BANK_DETAILS.bankName} · {BANK_DETAILS.accountNumber} · {BANK_DETAILS.accountName}.</li>
            <li>Upload your receipt. An admin verifies it and your tool unlocks.</li>
          </ol>
        </div>
      </section>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">© {new Date().getFullYear()} Eminent Clicks</footer>
    </div>
  );
}
