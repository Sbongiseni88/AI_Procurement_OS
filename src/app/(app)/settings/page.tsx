import { type Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { requireMembership, ROLE_LABELS } from "@/lib/workspace/membership";

export const metadata: Metadata = { title: "Settings" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:gap-6">
      <dt className="w-48 shrink-0 text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-ink">{value}</dd>
    </div>
  );
}

/* Read-only in E1. Editing company details and validity rules arrives in E2.7. */
export default async function SettingsPage() {
  const m = await requireMembership();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink">Company</h2>
        <dl className="divide-y divide-line rounded-md border border-line bg-surface">
          <Row label="Company name" value={m.organization.name} />
        </dl>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink">Your account</h2>
        <dl className="divide-y divide-line rounded-md border border-line bg-surface">
          <Row label="Name" value={m.fullName || "Not set"} />
          <Row label="Email" value={m.email} />
          <Row label="Role" value={ROLE_LABELS[m.role]} />
        </dl>
      </section>
    </div>
  );
}
