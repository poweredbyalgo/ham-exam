"use client";

import { useTheme } from "@/lib/theme";

const LABELS = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
} as const;

/** 三态主题切换：点击在 跟随系统 → 浅色 → 深色 之间循环。 */
export function ThemeToggle() {
  const { theme, cycle } = useTheme();
  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";

  return (
    <button
      type="button"
      onClick={cycle}
      className="btn btn-ghost btn-sm"
      title={`当前：${LABELS[theme]}，点击切换为「${LABELS[next]}」`}
      aria-label={`主题：${LABELS[theme]}，点击切换`}
    >
      {theme === "system" ? <SystemIcon /> : theme === "dark" ? <MoonIcon /> : <SunIcon />}
      <span className="hidden md:inline">{LABELS[theme]}</span>
    </button>
  );
}

function SystemIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
