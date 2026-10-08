import { CircleCheck, Circle } from "lucide-react";

type Step = { title: string; detail: string; done: boolean };

/**
 * Getting started, in order. Only the first step can be done today; the others open
 * as their features ship (company documents in E2, tenders in E3).
 */
export function SetupSteps({ companyName }: { companyName: string }) {
  const steps: Step[] = [
    { title: "Create your workspace", detail: `${companyName} is set up.`, done: true },
    {
      title: "Add your company documents",
      detail: "CIPC, tax, B-BBEE, CSD and the rest, checked for expiry and certification dates.",
      done: false,
    },
    {
      title: "Upload a tender",
      detail: "See what it requires and which of your documents meet it.",
      done: false,
    },
  ];

  return (
    <ol className="divide-y divide-line rounded-md border border-line bg-surface">
      {steps.map((step, index) => {
        const Icon = step.done ? CircleCheck : Circle;
        return (
          <li key={step.title} className="flex gap-3 px-4 py-3">
            <Icon
              aria-hidden="true"
              className={`mt-0.5 size-4 shrink-0 ${step.done ? "text-ink" : "text-ink-subtle"}`}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium text-ink">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
                <span className="sr-only">{step.done ? " (done)" : " (not done yet)"}</span>
              </p>
              <p className="text-sm break-words text-ink-muted">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
