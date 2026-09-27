"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, focusRing } from "@drinks-on-chain/ui";

/** Pestañas de sección como enlaces (cada una con su URL): aria-current en la activa. */
export function SubNav({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="border-b border-border">
      <ul className="-mb-px flex gap-1">
        {items.map((item) => {
          const current = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-t-md border-b-2 px-3 text-sm font-medium transition-colors",
                  current ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
                  focusRing,
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
