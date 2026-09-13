"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

/**
 * 顶部导航（桌面）与底部标签栏（移动端）。
 * 五个主入口保持一致，避免移动端出现「找不到功能」的问题。
 * 题库浏览（/browse）与数据下载（/downloads）是次要入口：
 * 桌面放在顶栏右侧，移动端放在首页的功能卡片里。
 */
const NAV_ITEMS = [
  { href: "/", label: "首页", icon: HomeIcon },
  { href: "/practice", label: "练习", icon: PracticeIcon },
  { href: "/exam", label: "考试", icon: ExamIcon },
  { href: "/review", label: "错题", icon: ReviewIcon },
  { href: "/stats", label: "统计", icon: StatsIcon },
] as const;

const SECONDARY_ITEMS = [
  { href: "/browse", label: "题库浏览" },
  { href: "/downloads", label: "数据下载" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-1 px-4">
          <Brand />
          <nav className="ml-3 hidden sm:flex items-center gap-0.5" aria-label="主导航">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-0.5">
            {SECONDARY_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`hidden rounded-lg px-2.5 py-1.5 text-sm transition-colors sm:block ${
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <nav
        aria-label="移动端导航"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] backdrop-blur-md pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                    active ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  <Icon active={active} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

type IconProps = { active?: boolean };

function svgProps(active?: boolean) {
  return {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2.2 : 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function HomeIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function PracticeIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </svg>
  );
}

function ExamIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2" />
      <path d="M9 2h6" />
    </svg>
  );
}

function ReviewIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z" />
    </svg>
  );
}

function StatsIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </svg>
  );
}
