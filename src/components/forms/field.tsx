import { type InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  error?: string;
  hint?: string;
};

/**
 * Labelled text input with its hint and error wired up through `aria-describedby`,
 * so screen readers announce them with the field.
 */
export function Field({ name, label, error, hint, id, ...input }: FieldProps) {
  const inputId = id ?? name;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-ink text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="border-line bg-surface text-ink placeholder:text-ink-subtle focus-visible:border-accent focus-visible:outline-accent aria-invalid:border-danger h-10 rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1"
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-ink-muted text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
