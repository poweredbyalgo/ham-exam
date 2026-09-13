"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ensureLoaded,
  getServerSnapshot,
  getSnapshot,
  subscribe,
} from "./store";

/**
 * 订阅本地进度 store。
 *
 * 首次使用时触发 IndexedDB 载入；服务端渲染返回同一份空快照，
 * 因此 SSR 输出稳定、不会 hydration mismatch，载入完成后自动重渲染。
 */
export function useStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    void ensureLoaded();
  }, []);
  return state;
}
