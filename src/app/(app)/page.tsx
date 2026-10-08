import { type Metadata } from "next";

import { EmptyPanel } from "@/components/dashboard/empty-panel";
import { SetupSteps } from "@/components/dashboard/setup-steps";
import { PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { COMPLIANCE_STATUSES, STATUS_MEANINGS } from "@/lib/compliance/statuses";
import { requireMembership } from "@/lib/workspace/membership";

export const metadata: Metadata = { title: "Dashboard" };

/*
 * Real empty states only: there are no tenders or company documents yet, so nothing
 * here shows a number that has not been counted. Panels fill in as E2.7 (expiring
 * documents) and E3.6 (closing soon) land.
 */
export default async function DashboardPage() {
  const { organization } = await requireMembership();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description={`What needs attention across ${organization.name}’s tenders and company documents.`}
      />

      <section aria-labelledby="setup-heading" className="flex flex-col gap-3">
        <h2 id="setup-heading" className="text-base font-semibold text-ink">
          Getting started
        </h2>
        <SetupSteps companyName={organization.name} />
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <EmptyPanel
          title="Tenders closing in the next 7 days"
          message="No tenders yet. Upload your first tender and its closing date will show here."
          link={{ href: "/tenders", label: "Go to tenders" }}
        />
        <EmptyPanel
          title="Documents expiring in the next 30 days"
          message="No company documents yet. Once they are added, any that expire soon or were certified too long ago will show here."
          link={{ href: "/documents", label: "Go to company documents" }}
        />
      </div>

      <section aria-labelledby="statuses-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="statuses-heading" className="text-base font-semibold text-ink">
            What the statuses mean
          </h2>
          <p className="text-sm text-ink-muted">
            Every tender requirement and company document gets one of these.
          </p>
        </div>
        <dl className="divide-y divide-line rounded-md border border-line bg-surface">
          {COMPLIANCE_STATUSES.map((status) => (
            <div
              key={status}
              className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <dt className="w-44 shrink-0">
                <StatusPill status={status} />
              </dt>
              <dd className="text-sm text-ink-muted">{STATUS_MEANINGS[status]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
