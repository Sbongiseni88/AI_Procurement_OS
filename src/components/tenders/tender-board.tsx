import { STAGE_DETAILS, TENDER_STAGES } from "@/lib/tenders/stages";

/**
 * The tender board: one column per stage. Columns stack on narrow screens instead of
 * scrolling sideways. Tenders arrive in E3.6; until then every column is empty and
 * says so.
 */
export function TenderBoard() {
  return (
    <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Tender stages">
      {TENDER_STAGES.map((stage) => {
        const { label, description } = STAGE_DETAILS[stage];
        return (
          <li
            key={stage}
            className="flex min-w-0 flex-col rounded-md border border-line bg-surface"
          >
            <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">{label}</h2>
              <span className="text-xs text-ink-muted tabular-nums">
                0<span className="sr-only"> tenders</span>
              </span>
            </div>
            <div className="flex flex-col gap-1 px-4 py-4">
              <p className="text-sm text-ink-muted">{description}</p>
              <p className="text-sm text-ink-subtle">No tenders here.</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
