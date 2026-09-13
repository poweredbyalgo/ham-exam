"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 底部固定的操作条。
 *
 * 背景：练习页的「上一题 / 提交 / 下一题」原来跟在题目卡后面，题干或附图一变长
 * 按钮就被推到屏幕外，手机上得先把页面拖到底才能点到。
 *
 * 实现要点：
 *   - 用 `fixed` 而不是 `sticky`：sticky 元素在容器底部仍会与后续内容重叠，
 *     而 fixed 可以精确控制位置，再用一个等高占位符把内容顶上去
 *   - 占位高度用 ResizeObserver 实测（按钮可能换行，高度不固定），
 *     再加上自身离底距离，保证页面最后一块内容不会被永久遮住
 *   - 手机端贴在底部导航栏之上（3.5rem = 56px 导航高度），并叠加
 *     safe-area-inset-bottom，避免被 iPhone 的 Home 指示条压住
 *   - ≥sm 时底部导航消失，直接贴底
 */
export function StickyActions({
  children,
  "aria-label": ariaLabel = "答题操作",
}: {
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(64);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const offset = "calc(3.5rem + env(safe-area-inset-bottom))";

  return (
    <>
      <div
        ref={barRef}
        role="group"
        aria-label={ariaLabel}
        className="fixed inset-x-0 z-30 px-4 sm:px-6"
        style={{ bottom: offset }}
      >
        <div className="mx-auto max-w-5xl">
          {/* 渐变遮罩：让滚动内容在按钮下方淡出，而不是被硬切 */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-[var(--bg)] to-transparent"
          />
          <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-2 shadow-[var(--shadow-lg)] backdrop-blur-md">
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {children}
            </div>
          </div>
        </div>
      </div>

      {/* 等高占位，把页面内容与页脚顶到操作条之上 */}
      <div
        aria-hidden
        style={{ height: `calc(${height}px + ${offset} + 0.5rem)` }}
      />
    </>
  );
}
