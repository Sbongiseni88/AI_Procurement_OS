import { type Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Tenders" };

/* The tender board arrives in E1.8. */
export default function TendersPage() {
  return <PageHeader title="Tenders" />;
}
