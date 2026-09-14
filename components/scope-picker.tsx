"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  chapters,
  filterByScope,
  knowledgePoints,
} from "@/lib/question-bank";
import type { BankId } from "@/lib/types";

/** 当前 scope 对应的可读标签，供选择器按钮与外部（如 header 触发器）复用。 */
export function scopeLabel(bank: BankId, scope: string): string {
  if (scope === "all") return "全部题目";
  if (scope.includes(".")) {
    const kp = knowledgePoints(bank).find((k) => k.knowledgePoint === scope);
    return `知识点 ${scope}（${kp?.count ?? 0} 题）`;
  }
  const ch = chapters(bank).find((c) => c.chapter === scope);
  return ch?.name ?? `第 ${scope} 章`;
}

/**
 * 章节 / 知识点列表（不含触发按钮）。
 * 桌面端由 ScopePicker 包在弹出层里使用；手机端的筛选弹层直接内联使用，
 * 避免「弹层里再套下拉」被 overflow 裁剪。
 */
export function ScopeOptions({
  bank,
  scope,
  onPick,
}: {
  bank: BankId;
  scope: string;
  /** 选择某个 scope 后回调；不传则直接跳转（默认行为） */
  onPick?: (next: string) => void;
}) {
  const router = useRouter();
  const chs = chapters(bank);
  const kps = knowledgePoints(bank);
  const total = filterByScope(bank, "all").length;

  const go = (next: string) => {
    if (onPick) {
      onPick(next);
      return;
    }
    const qs = new URLSearchParams({ bank, scope: next });
    router.push(`/practice?${qs.toString()}`);
  };

  return (
    <div role="listbox" aria-label="选择章节或知识点">
      <button
        type="button"
        role="option"
        aria-selected={scope === "all"}
        onClick={() => go("all")}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
          scope === "all" ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "hover:bg-[var(--surface-2)]"
        }`}
      >
        <span>全部题目</span>
        <span className="font-mono text-xs text-[var(--text-subtle)]">{total}</span>
      </button>

      <div className="my-1 border-t border-[var(--border)]" />
      {chs.map((c) => {
        const kpsInChapter = kps.filter((k) => k.knowledgePoint.startsWith(`${c.chapter}.`));
        const active = scope === c.chapter;
        return (
          <div key={c.chapter}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => go(c.chapter)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                active ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className="truncate">
                <span className="mr-1 font-mono text-xs text-[var(--text-subtle)]">
                  {c.chapter}
                </span>
                {c.name || `第 ${c.chapter} 章`}
              </span>
              <span className="font-mono text-xs text-[var(--text-subtle)]">{c.count}</span>
            </button>

            {/* 知识点按需展开，避免一次渲染上百条 */}
            <details className="group">
              <summary className="cursor-pointer list-none rounded-lg px-3 py-1 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface-2)]">
                <span className="group-open:hidden">
                  展开 {kpsInChapter.length} 个知识点
                </span>
                <span className="hidden group-open:inline">收起知识点</span>
              </summary>
              <div className="ml-3 border-l border-[var(--border)] pl-1">
                {kpsInChapter.map((k) => {
                  const kpActive = scope === k.knowledgePoint;
                  return (
                    <button
                      key={k.knowledgePoint}
                      type="button"
                      role="option"
                      aria-selected={kpActive}
                      onClick={() => go(k.knowledgePoint)}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs ${
                        kpActive ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      <span className="font-mono">{k.knowledgePoint}</span>
                      <span className="text-[var(--text-subtle)]">{k.count}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 章节 / 知识点选择器。用原生 <details> 实现下拉，
 * 不引入弹出层库，且天然支持键盘与无 JS 降级。
 */
export function ScopePicker({
  bank,
  scope,
  mode,
  className = "",
}: {
  bank: BankId;
  scope: string;
  mode: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = scopeLabel(bank, scope);

  const go = (next: string) => {
    setOpen(false);
    const qs = new URLSearchParams({ bank, scope: next });
    if (mode === "memorize") qs.set("mode", "memorize");
    router.push(`/practice?${qs.toString()}`);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        className="btn btn-sm min-w-0 flex-none px-2 sm:px-2.5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {/* 窄屏隐藏前置图标，把宽度让给范围名称 */}
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
          className="hidden sm:block"
        >
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        <span className="min-w-0 max-w-[5.5rem] truncate sm:max-w-40">{label}</span>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-lg)]">
          <ScopeOptions bank={bank} scope={scope} onPick={go} />
        </div>
      )}
    </div>
  );
}
