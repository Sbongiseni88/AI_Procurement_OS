"use client";

import { FileText, FolderOpen, LayoutDashboard, type LucideIcon, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS: ReadonlyArray<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tenders", label: "Tenders", icon: FileText },
  { href: "/documents", label: "Company documents", icon: FolderOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The main navigation, used in the desktop sidebar and in the phone drawer. When it
 * sits inside a popover (`closePopoverId`), following a link closes the drawer, which
 * client-side navigation would otherwise leave open.
 */
export function SidebarNav({ closePopoverId }: { closePopoverId?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (closePopoverId) document.getElementById(closePopoverId)?.hidePopover();
                }}
                className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                  active
                    ? "bg-surface-muted font-medium text-ink"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                }`}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
