"use client";

import { useEffect, useState } from "react";

/**
 * 注册 Service Worker（仅生产环境）。
 * 开发环境下 SW 会缓存 _next/static 导致热更新失效，因此只在 prod 注册，
 * 并在发现新版本时提示用户刷新。
 */
export function ServiceWorkerRegistrar() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        if (cancelled) return;

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setUpdateReady(true);
            }
          });
        });
      } catch {
        /* 注册失败不影响在线使用 */
      }
    };

    // 等页面空闲再注册，避免与首屏渲染抢带宽
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => void register());
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }
    const timer = window.setTimeout(() => void register(), 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!updateReady) return null;

  // 移动端要避开底部导航栏与练习/考试页的固定操作条（两者叠加约
  // 108px + safe-area），否则「刷新」按钮会被操作条盖住点不到
  return (
    <div className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 sm:bottom-6">
      <div className="card flex items-center gap-3 px-4 py-2 shadow-[var(--shadow-lg)]">
        <span className="text-sm">发现新版本</span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => window.location.reload()}
        >
          刷新
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setUpdateReady(false)}
        >
          稍后
        </button>
      </div>
    </div>
  );
}
