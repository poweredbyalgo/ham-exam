"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 全屏切换按钮（仅移动端显示）：进入系统全屏后，浏览器的地址栏与
 * 底部工具栏会隐藏，答题区域获得完整的可视高度。
 *
 * 兼容性：iOS Safari 不支持元素级 Fullscreen API，检测不到时仍渲染
 * 按钮但在点击时静默降级（提示使用「添加到主屏幕」全屏打开）。
 */
export function FullscreenToggle() {
  const [active, setActive] = useState(false);

  // 监听系统级全屏变化（含用户用系统手势/返回键退出全屏的情况）。
  // setState 只发生在事件回调里，不在 effect 体内同步调用。
  useEffect(() => {
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (!document.fullscreenEnabled) {
      // iOS Safari 等不支持时给出替代路径提示
      window.alert("当前浏览器不支持网页全屏。可在菜单中选择「添加到主屏幕」，以全屏方式打开。");
      return;
    }
    void document.documentElement
      .requestFullscreen({ navigationUI: "hide" })
      .catch(() => undefined);
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-sm px-2"
      aria-pressed={active}
      aria-label={active ? "退出全屏" : "全屏显示"}
      title={active ? "退出全屏" : "全屏显示（隐藏浏览器地址栏与工具栏）"}
    >
      {active ? <ExitFullscreenIcon /> : <FullscreenIcon />}
    </button>
  );
}

function FullscreenIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 9V4h5" />
      <path d="M15 4h5v5" />
      <path d="M20 15v5h-5" />
      <path d="M9 20H4v-5" />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 4v5H4" />
      <path d="M20 9h-5V4" />
      <path d="M15 20v-5h5" />
      <path d="M4 15h5v5" />
    </svg>
  );
}
