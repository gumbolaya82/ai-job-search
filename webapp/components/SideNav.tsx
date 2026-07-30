"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The icon rail.
 *
 * `.navlink.on` has existed in globals.css since the first version and nothing
 * ever applied it, so the nav looked identical on every screen. It needs the
 * current route, which only a client component can read — hence this file, the
 * one client boundary in an otherwise server-rendered shell.
 *
 * Labels live in `title` + `aria-label`: the rail is glyph-only, so the name has
 * to reach both a hovering mouse and a screen reader.
 */

const NAV = [
  { href: "/", label: "Jobs", glyph: "▤" },
  { href: "/scrape", label: "Scrape", glyph: "⟳" },
  { href: "/profiles", label: "Profiles", glyph: "◎" },
  { href: "/documents", label: "Documents", glyph: "▥" },
];

/** "/" matches only itself; every other entry matches its subtree. */
function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export default function SideNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="side" aria-label="Sections">
      <Link href="/" className="brandmark" title="ai-job-search" aria-label="ai-job-search">
        js
      </Link>
      {NAV.map((n) => {
        const on = isCurrent(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`navlink${on ? " on" : ""}`}
            title={n.label}
            aria-label={n.label}
            aria-current={on ? "page" : undefined}
          >
            <span aria-hidden="true">{n.glyph}</span>
          </Link>
        );
      })}
    </nav>
  );
}
