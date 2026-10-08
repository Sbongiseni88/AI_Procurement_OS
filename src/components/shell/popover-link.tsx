"use client";

import Link from "next/link";
import { type ComponentProps } from "react";

/**
 * A link inside a native popover that closes the popover when followed. Client-side
 * navigation keeps the layout (and so the open popover) on screen otherwise.
 */
export function PopoverLink({
  popoverId,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { popoverId: string }) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        document.getElementById(popoverId)?.hidePopover();
      }}
    />
  );
}
