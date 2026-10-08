import { type Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Company documents" };

/* The document vault (upload, AI reading, expiry status) is built in E2. */
export default function DocumentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Company documents"
        description="Your CIPC, tax, B-BBEE, CSD and other company documents, with their expiry and certification dates."
      />
      <section className="rounded-md border border-line bg-surface px-5 py-6">
        <h2 className="text-base font-semibold text-ink">Document uploads are not open yet</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Uploading and checking company documents is the next part being built. Nothing has been
          uploaded for your company.
        </p>
      </section>
    </div>
  );
}
