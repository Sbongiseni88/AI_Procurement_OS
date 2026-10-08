import { ChevronDown } from "lucide-react";

import { logOut } from "@/lib/auth/actions";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { type Membership } from "@/lib/workspace/membership";

import { PopoverLink } from "./popover-link";

const MENU_ID = "user-menu";

/**
 * Account menu in the header. A native `popover`: Esc and clicking outside close it,
 * and it needs no client JavaScript. It is pinned under the header's right edge with
 * fixed positioning rather than CSS anchor positioning, which not every browser the
 * client's team uses supports yet.
 */
export function UserMenu({ membership }: { membership: Membership }) {
  const name = membership.fullName || membership.email;
  return (
    <>
      <button
        type="button"
        popoverTarget={MENU_ID}
        className="flex h-9 max-w-56 items-center gap-1.5 rounded-md px-2.5 text-sm text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="truncate">{name}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
        <span className="sr-only">: account menu</span>
      </button>
      <div
        id={MENU_ID}
        popover="auto"
        className="fixed inset-auto top-14 right-3 m-0 w-72 max-w-[calc(100vw-1.5rem)] rounded-md border border-line bg-surface p-1 text-sm text-ink"
      >
        <div className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="font-medium break-words">{name}</span>
          <span className="break-all text-ink-muted">{membership.email}</span>
          <span className="text-ink-muted">
            {ROLE_LABELS[membership.role]} at {membership.organization.name}
          </span>
        </div>
        <div className="my-1 border-t border-line" />
        <PopoverLink
          popoverId={MENU_ID}
          href="/settings"
          className="flex h-9 items-center rounded px-3 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        >
          Settings
        </PopoverLink>
        <form action={logOut}>
          <button
            type="submit"
            className="flex h-9 w-full items-center rounded px-3 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
          >
            Log out
          </button>
        </form>
      </div>
    </>
  );
}
