import {
  CalendarX,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  Clock,
  Eye,
  GitCompareArrows,
  type LucideIcon,
} from "lucide-react";

import { type ComplianceStatus, STATUS_LABELS } from "@/lib/compliance/statuses";

const ICONS: Record<ComplianceStatus, LucideIcon> = {
  compliant: CircleCheck,
  expiring: Clock,
  expired: CalendarX,
  missing: CircleDashed,
  conflict: GitCompareArrows,
  "needs-verification": Eye,
  "unable-to-verify": CircleHelp,
};

/*
 * Literal class strings per status, so Tailwind can see every one at build time
 * (a class assembled from `status` at runtime would never be generated).
 */
const STYLES: Record<ComplianceStatus, string> = {
  compliant: "border-status-compliant-line bg-status-compliant-bg text-status-compliant-fg",
  expiring: "border-status-expiring-line bg-status-expiring-bg text-status-expiring-fg",
  expired: "border-status-expired-line bg-status-expired-bg text-status-expired-fg",
  missing: "border-dashed border-status-missing-line bg-status-missing-bg text-status-missing-fg",
  conflict: "border-status-conflict-line bg-status-conflict-bg text-status-conflict-fg",
  "needs-verification": "border-status-verify-line bg-status-verify-bg text-status-verify-fg",
  "unable-to-verify": "border-status-unknown-line bg-status-unknown-bg text-status-unknown-fg",
};

/**
 * One status tag. Meaning is carried by the label and the icon as well as the colour,
 * so it survives colour-blindness and greyscale printing (the E4.4 gap report).
 */
export function StatusPill({ status }: { status: ComplianceStatus }) {
  const Icon = ICONS[status];
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded border px-2 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}
    >
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
      {STATUS_LABELS[status]}
    </span>
  );
}
