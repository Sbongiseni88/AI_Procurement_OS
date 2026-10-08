"use client";

import { useFormStatus } from "react-dom";

/** Primary form button. Shows `pendingLabel` and blocks double submits while the action runs. */
export function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="bg-accent text-accent-ink hover:bg-accent-hover focus-visible:outline-accent h-10 rounded-md px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress disabled:opacity-70"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
