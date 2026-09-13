"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ProgressBar } from "@/components/progress-bar";
import { SettingsPanel } from "@/components/settings-panel";
import {
  BANK_IDS,
  BANK_NAMES,
  bankMeta,
  chapterName,
  chapterOf,
  chapters,
} from "@/lib/question-bank";
import { bankProgress, knowledgePointStats, overviewStats } from "@/lib/store";
import { useStore } from "@/lib/use-store";
import type { BankId } from "@/lib/types";

export function StatsClient() {
  const params = useSearchParams();
  const bankParam = params.get("bank");
  const bank: BankId =
    bankParam === "B" || bankParam === "C" ? bankParam : "A";
  const { ready } = useStore();
  const [onlyWeak, setOnlyWeak] = useState(false);

  const kpStats = useMemo(() => (ready ? knowledgePointStats(bank) : []), [ready, bank]);
  const overview = useMemo(() => (ready ? overviewStats() : null), [ready]);

  const chapterRows = useMemo(() => {
    return chapters(bank).map((c) => {
      const inChapter = kpStats.filter((k) => chapterOf(k.knowledgePoint) === c.chapter);
      const attempted = inChapter.reduce((s, k) => s + k.attempted, 0);
      const correct = inChapter.reduce((s, k) => s + k.correct, 0);
      const wrong = inChapter.reduce((s, k) => s + k.wrong, 0);
      return {
        chapter: c.chapter,
        name: c.name || chapterName(bank, c.chapter),
        total: c.count,
        attempted,
        accuracy: correct + wrong > 0 ? correct / (correct + wrong) : -1,
      };
    });
  }, [bank, kpStats]);

  if (!ready || !overview) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-32 w-full rounded-xl" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    );
  }

  const progress = bankProgress(bank);
  const maxDay = Math.max(1, ...overview.last7Days.map((d) => d.attempts));
  const weak = kpStats
    .filter((k) => k.attempted > 0 && k.accuracy >= 0 && k.accuracy < 0.8)
    .sort((a, b) => a.accuracy - b.accuracy);
  const rows = onlyWeak ? weak : kpStats;

  return (
    <div className="space-y-4">
      <header className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">掌握度统计</h1>
          <div className="ml-auto flex gap-1">
            {BANK_IDS.map((b) => (
              <Link
                key={b}
                href={`/stats?bank=${b}`}
                className={`btn btn-sm ${bank === b ? "btn-primary" : "btn-ghost"}`}
              >
                {BANK_NAMES[b]}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          value={`${(overview.accuracy * 100).toFixed(1)}%`}
          label="总正确率"
          sub={`${overview.totalCorrect} / ${overview.totalAttempts} 次作答`}
        />
        <MetricCard
          value={`${overview.coveredQuestions}`}
          label="已作答题目（去重）"
          sub={`A ${overview.coveredByBank.A} · B ${overview.coveredByBank.B} · C ${overview.coveredByBank.C}`}
        />
        <MetricCard
          value={`${overview.wrongCount}`}
          label="待复习错题"
          sub={`已掌握 ${overview.masteredCount} 题`}
          href="/review"
        />
        <MetricCard
          value={`${overview.streakDays} 天`}
          label="连续练习"
          sub={`收藏 ${overview.starredCount} 题`}
        />
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">
            {BANK_NAMES[bank]}题库进度
          </h2>
          <span className="text-xs text-[var(--text-subtle)]">
            {bankMeta[bank].sourceFile}
          </span>
          <Link
            href={`/practice?bank=${bank}`}
            className="btn btn-sm btn-ghost ml-auto"
          >
            去练习
          </Link>
        </div>
        <div className="mt-3">
          <ProgressBar
            value={progress.done}
            max={progress.total}
            label={`已练习 ${progress.done} / ${progress.total} 题`}
            tone={progress.done === progress.total ? "success" : "accent"}
          />
        </div>

        <div className="mt-5">
          <h3 className="text-xs font-medium text-[var(--text-muted)]">
            最近 7 天作答
          </h3>
          <div className="mt-2 flex h-24 items-end gap-1.5">
            {overview.last7Days.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="relative w-full overflow-hidden rounded-t bg-[var(--surface-2)]"
                  style={{ height: `${Math.max(4, (d.attempts / maxDay) * 72)}px` }}
                  title={`${d.date}：作答 ${d.attempts} 次，正确 ${d.correct} 次`}
                >
                  <div
                    className="absolute bottom-0 w-full bg-[var(--success)]"
                    style={{
                      height: `${d.attempts > 0 ? (d.correct / d.attempts) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] text-[var(--text-subtle)]">{d.date}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
            柱高表示作答量，绿色部分为答对占比
          </p>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">章节掌握度</h2>
        <ul className="mt-3 space-y-3">
          {chapterRows.map((c) => (
            <li key={c.chapter}>
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-mono text-xs text-[var(--text-subtle)]">
                  {c.chapter}
                </span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="font-mono text-xs text-[var(--text-subtle)]">
                  {c.attempted > 0 ? `${(c.accuracy * 100).toFixed(0)}%` : "未练习"}
                </span>
              </div>
              <div className="mt-1">
                <ProgressBar
                  value={c.attempted}
                  max={c.total}
                  tone={
                    c.accuracy < 0
                      ? "accent"
                      : c.accuracy >= 0.9
                        ? "success"
                        : c.accuracy >= 0.7
                          ? "warn"
                          : "danger"
                  }
                />
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--text-subtle)]">
                已练 {c.attempted} / {c.total} 题
                {c.accuracy >= 0 && ` · 正确率 ${(c.accuracy * 100).toFixed(0)}%`}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">知识点明细</h2>
          <span className="text-xs text-[var(--text-subtle)]">
            共 {kpStats.length} 个知识点
          </span>
          <button
            type="button"
            className={`btn btn-sm ml-auto ${onlyWeak ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setOnlyWeak((v) => !v)}
          >
            只看薄弱项（{weak.length}）
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            {onlyWeak
              ? "暂无明显薄弱知识点，继续保持。"
              : "该题库暂无知识点数据。"}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-subtle)]">
                  <th className="py-2 font-medium">知识点</th>
                  <th className="py-2 text-right font-medium">题量</th>
                  <th className="py-2 text-right font-medium">已练</th>
                  <th className="py-2 text-right font-medium">正确率</th>
                  <th className="py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => (
                  <tr key={k.knowledgePoint} className="border-b border-[var(--border)]/60">
                    <td className="py-2 font-mono text-xs">{k.knowledgePoint}</td>
                    <td className="py-2 text-right font-mono text-xs text-[var(--text-subtle)]">
                      {k.total}
                    </td>
                    <td className="py-2 text-right font-mono text-xs text-[var(--text-subtle)]">
                      {k.attempted}
                    </td>
                    <td className="py-2 text-right">
                      {k.accuracy < 0 ? (
                        <span className="text-xs text-[var(--text-subtle)]">—</span>
                      ) : (
                        <span
                          className={`font-mono text-xs ${
                            k.accuracy >= 0.9
                              ? "text-[var(--success)]"
                              : k.accuracy >= 0.7
                                ? "text-[var(--warn)]"
                                : "text-[var(--danger)]"
                          }`}
                        >
                          {(k.accuracy * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/practice?bank=${bank}&scope=${k.knowledgePoint}`}
                        className="btn btn-ghost btn-sm"
                      >
                        练习
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SettingsPanel />
    </div>
  );
}

function MetricCard({
  value,
  label,
  sub,
  href,
}: {
  value: string;
  label: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-[var(--text-muted)]">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-[var(--text-subtle)]">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card p-4 transition-colors hover:border-[var(--accent)]">
      {inner}
    </Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}
