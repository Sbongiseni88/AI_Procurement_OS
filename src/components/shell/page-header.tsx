import { type ReactNode } from "react";

/** Title row at the top of every workspace page, with an optional action on the right. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-ink">{title}</h1>
        {description && <p className="max-w-prose text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
