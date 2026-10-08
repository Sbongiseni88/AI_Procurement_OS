import { type Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { requireMembership } from "@/lib/workspace/membership";

export const metadata: Metadata = { title: "Dashboard" };

/* Dashboard content (counts, closing soon, expiring documents) arrives in E1.8. */
export default async function DashboardPage() {
  const { organization } = await requireMembership();
  return (
    <PageHeader title="Dashboard" description={`Tender compliance for ${organization.name}.`} />
  );
}
