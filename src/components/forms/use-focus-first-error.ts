"use client";

import { useEffect, useRef } from "react";

/**
 * After a failed submit, moves keyboard focus to the first invalid field so the
 * person lands on the problem instead of hunting for it. Re-runs whenever the
 * action returns a new state object.
 */
export function useFocusFirstError(state: unknown) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  return formRef;
}
