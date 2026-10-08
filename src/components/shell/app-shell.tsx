import { Menu, X } from "lucide-react";
import { type ReactNode } from "react";

import { type Membership } from "@/lib/workspace/membership";

import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

const DRAWER_ID = "nav-drawer";

function CompanyName({ name }: { name: string }) {
  return (
    <span translate="no" className="truncate text-sm font-semibold tracking-tight text-ink">
      {name}
    </span>
  );
}

/**
 * Workspace frame: sidebar navigation from 1024px up; below that, a header with a
 * menu button that opens the same navigation as a drawer (a native `popover`).
 */
export function AppShell({
  membership,
  children,
}: {
  membership: Membership;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:outline-2 focus:outline-accent"
      >
        Skip to main content
      </a>

      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-line bg-surface px-3 py-4 lg:flex">
        <div className="flex h-9 items-center px-2.5">
          <CompanyName name={membership.organization.name} />
        </div>
        <SidebarNav />
      </aside>

      <div
        id={DRAWER_ID}
        popover="auto"
        className="fixed inset-y-0 right-auto left-0 m-0 h-full max-h-none w-72 max-w-[85vw] flex-col gap-6 overscroll-contain border-r border-line bg-surface px-3 py-4 backdrop:bg-ink/30 open:flex lg:hidden"
      >
        <div className="flex h-9 items-center justify-between gap-2 pl-2.5">
          <CompanyName name={membership.organization.name} />
          <button
            type="button"
            popoverTarget={DRAWER_ID}
            popoverTargetAction="hide"
            aria-label="Close navigation"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <SidebarNav closePopoverId={DRAWER_ID} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 sm:px-4 lg:justify-end lg:px-6">
          <div className="flex min-w-0 items-center gap-1 lg:hidden">
            <button
              type="button"
              popoverTarget={DRAWER_ID}
              aria-label="Open navigation"
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <CompanyName name={membership.organization.name} />
          </div>
          <UserMenu membership={membership} />
        </header>

        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
