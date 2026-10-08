import { type Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { TenderBoard } from "@/components/tenders/tender-board";
import { UploadTenderButton } from "@/components/tenders/upload-tender-button";

export const metadata: Metadata = { title: "Tenders" };

export default function TendersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tenders"
        description="Every tender or RFQ you are working on, by stage."
        action={<UploadTenderButton noteId="upload-tender-note" />}
      />
      <section className="rounded-md border border-dashed border-line-strong bg-surface px-5 py-6">
        <h2 className="text-base font-semibold text-ink">No tenders yet</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Upload your first tender or RFQ. Its closing date, briefing session and returnable
          documents will be read for you, each linked to the page it came from.
        </p>
      </section>
      <TenderBoard />
    </div>
  );
}
