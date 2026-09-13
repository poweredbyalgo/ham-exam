"use client";

import Link from "next/link";
import { useStore } from "@/lib/use-store";
import { bankProgress, overviewStats } from "@/lib/store";
import { BANK_IDS, bankMeta } from "@/lib/question-bank";
import { ProgressBar } from "./progress-bar";

/** 首页进度概览：依赖浏览器本地数据，因此是客户端组件。 */
export function HomeOverview() {
  const { ready } = useStore();
  const stats = overviewStats();

  if (!ready) {
    return (
      <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-6 w-16" />
            <div className="skeleton h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const hasData = stats.totalAttempts > 0;

  return (
    <div className="p-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric
          value={stats.totalAttempts > 0 ? `${(stats.accuracy * 100).toFixed(1)}%` : "—"}
          label="总正确率"
        />
        <Metric value={String(stats.totalAttempts)} label="累计作答" />
        <Metric value={String(stats.wrongCount)} label="待复习错题" />
        <Metric
          value={hasData ? `${stats.streakDays} 天` : "—"}
          label="连续练习"
        />
      </div>

      <div className="mt-5 space-y-3">
        {BANK_IDS.map((bank) => {
          const { done, total } = bankProgress(bank);
          return (
            <div key={bank} className="flex items-center gap-3">
              <Link
                href={`/stats?bank=${bank}`}
                className="w-14 flex-none text-sm font-medium hover:text-[var(--accent-text)]"
              >
                {bank} 类
              </Link>
              <div className="flex-1">
                <ProgressBar
                  value={done}
                  max={total}
                  label={`已练习 ${done} / ${total}`}
                  tone={done === total ? "success" : "accent"}
                />
              </div>
            </div>
          );
        })}
      </div>

      {!hasData && (
        <p className="mt-4 text-xs text-[var(--text-subtle)]">
          还没有练习记录。从任一题库开始，进度会自动保存在本机。
          {bankMeta.A.total > 0 && " 建议先从 A 类题库入手。"}
        </p>
      )}
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-[var(--text-subtle)]">{label}</div>
    </div>
  );
}
