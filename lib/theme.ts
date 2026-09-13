"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-script";
import type { ThemePreference } from "./types";

/**
 * 主题偏好状态。
 *
 * 用 useSyncExternalStore 读取 localStorage，避免「客户端独有状态」
 * 在 SSR 时产生 hydration 警告：服务端固定返回 "system"，
 * 客户端首帧后立即同步为真实值。
 */
const listeners = new Set<() => void>();
let current: ThemePreference = "system";

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readStored(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function apply(pref: ThemePreference) {
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = pref;
}

export function setTheme(pref: ThemePreference) {
  current = pref;
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* 隐私模式下写入失败：仅本次会话生效 */
  }
  apply(pref);
  for (const l of listeners) l();
}

/** 订阅系统配色变化，使「跟随系统」即时生效 */
function useSystemListener(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      apply("system");
      for (const l of listeners) l();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [active]);
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => current,
    () => "system" as ThemePreference,
  );

  // 首次挂载同步真实值（服务端快照固定为 system）
  useEffect(() => {
    const stored = readStored();
    if (stored !== current) {
      current = stored;
      apply(stored);
      for (const l of listeners) l();
    }
  }, []);

  useSystemListener(theme === "system");

  const cycle = useCallback(() => {
    const order: ThemePreference[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(current) + 1) % order.length];
    setTheme(next);
  }, []);

  return { theme, setTheme, cycle };
}
