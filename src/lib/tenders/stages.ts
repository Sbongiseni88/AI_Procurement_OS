/**
 * Tender stages, in board order. Planned with E3/E4: a tender is created in
 * "reading" when its PDF is uploaded (E3.2), moves to "review" once its facts and
 * returnables are read, to "checking" while documents are matched (E4.1), and to
 * "checked" when every mandatory requirement is met or overridden (E4.5).
 * E3.1's `tender_stage` enum must use these values.
 */
export const TENDER_STAGES = ["reading", "review", "checking", "checked"] as const;

export type TenderStage = (typeof TENDER_STAGES)[number];

export const STAGE_DETAILS: Record<TenderStage, { label: string; description: string }> = {
  reading: { label: "Reading", description: "The tender document is being read." },
  review: { label: "To review", description: "Check the facts and returnables that were read." },
  checking: {
    label: "Checking compliance",
    description: "Returnables matched to your company documents; gaps being fixed.",
  },
  checked: {
    label: "Compliance checked",
    description: "Every mandatory requirement is met or overridden with a reason.",
  },
};
