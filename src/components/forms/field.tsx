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
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger"
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
