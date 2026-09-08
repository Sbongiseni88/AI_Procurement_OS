import { ShieldCheck } from "lucide-react";

/*
 * T1.1 foundation check. This is a deliberate placeholder: it renders the ported
 * design tokens so the Tailwind theme, Lucide icons and strict TS build are all
 * verifiable at a glance. The real Executive Command Centre lands in T2.1.
 */

const STATUS_PILLS = [
  { label: "FOUND", className: "bg-status-found-bg text-status-found-ink" },
  { label: "VERIFY", className: "bg-status-verify-bg text-status-verify-ink" },
  { label: "MISSING", className: "bg-status-missing-bg text-status-missing-ink" },
  { label: "NOT CLAIMED", className: "bg-status-info-bg text-status-info-ink" },
] as const;

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-3">
        <ShieldCheck className="text-action size-6" aria-hidden />
        <h1 className="text-2xl font-extrabold tracking-tight">AI Procurement OS</h1>
      </div>
      <p className="text-ink-muted mt-2 text-xs">
        South African Procurement Intelligence · V1 MVP foundation
      </p>

      <section className="border-hairline bg-surface shadow-panel mt-8 rounded-xl border">
        <h2 className="border-rule border-b px-4 py-3.5 text-[15px] font-semibold">
          Foundation Status — T1.1
        </h2>
        <div className="space-y-5 p-4">
          <div className="border-copilot-border bg-copilot-bg rounded-[10px] border p-3 text-xs">
            <strong>Stack online:</strong> Next.js 16 (App Router) · React 19 · TypeScript strict ·
            Tailwind CSS 4 · ESLint + Prettier · Lucide icons.
          </div>

          <div>
            <p className="text-ink-muted mb-2 text-xs">Compliance status tokens</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_PILLS.map((pill) => (
                <span
                  key={pill.label}
                  className={`inline-block rounded-xl px-[7px] py-1 text-[10px] font-bold ${pill.className}`}
                >
                  {pill.label}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-ink-muted mb-2 text-xs">Readiness meter</p>
            <div className="bg-meter-track h-2 overflow-hidden rounded-md">
              <div className="bg-meter-fill h-full w-[61%]" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
