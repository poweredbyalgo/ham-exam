"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ReviewQuestionList } from "@/components/review-list";
import { BANK_NAMES, getQuestion, isCorrect } from "@/lib/question-bank";
import { useStore } from "@/lib/use-store";

export function ResultClient() {
  const params = useSearchParams();
  const id = params.get("session") ?? "";
  const { ready, exams, results } = useStore();
  const [filter, setFilter] = useState<"all" | "wrong" | "blank">("wrong");

  if (!ready) {
    return <div className="skeleton h-64 w-full rounded-xl" />;
  }

  const session = exams[id];
  const result = results.find((r) => r.id === id);

  if (!session || !result) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          找不到这场考试的成绩记录。
        </p>
        <Link href="/exam" className="btn btn-primary mt-4">
          重新组卷
        </Link>
      </div>
    );
  }

  const items = session.keys
    .map((key) => {
      const located = getQuestion(key);
      if (!located) return null;
      const picked = session.answers[key]?.selected ?? [];
      const ok = picked.length > 0 && isCorrect(picked, located.question.answer);
      return { key, ...located, picked, ok };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const wrongItems = items.filter((x) => !x.ok && x.picked.length > 0);
  const blankItems = items.filter((x) => x.picked.length === 0);
  const shown =
    filter === "all" ? items : filter === "wrong" ? wrongItems : blankItems;

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div
          className={`p-5 ${
            result.passed
              ? "bg-gradient-to-br from-[var(--success-soft)] to-transparent"
              : "bg-gradient-to-br from-[var(--danger-soft)] to-transparent"
          }`}
        >
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div
                className={`font-mono text-4xl font-semibold tabular-nums ${
                  result.passed ? "text-[var(--success)]" : "text-[var(--danger)]"
                }`}
              >
                {result.score.toFixed(0)}
                <span className="text-lg"> 分</span>
              </div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">
                {result.passed ? "达标" : "未达标"} · 及格线 {result.passRate}%
              </div>
            </div>
            <dl className="ml-auto grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <Stat label="题库" value={BANK_NAMES[result.bank]} />
              <Stat label="正确" value={`${result.correct} 题`} tone="success" />
              <Stat label="错误" value={`${result.wrong} 题`} tone="danger" />
              <Stat label="用时" value={formatDuration(result.durationSec)} />
            </dl>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] p-3">
          <Link href="/exam" className="btn btn-primary btn-sm">
            再考一次
          </Link>
          <Link
            href={`/practice?bank=${result.bank}&scope=all`}
            className="btn btn-sm"
          >
            针对本库继续练习
          </Link>
          <Link href="/review" className="btn btn-sm">
            复习错题（{wrongItems.length + blankItems.length}）
          </Link>
        </div>
      </section>

      {result.knowledgePointMiss.length > 0 && (
        <section className="card p-4">
          <h2 className="text-sm font-semibold">失分知识点分布</h2>
          <p className="mt-1 text-xs text-[var(--text-subtle)]">
            按失分题数排序，优先复习排在前面的知识点。
          </p>
          <ul className="mt-3 space-y-1.5">
            {result.knowledgePointMiss.slice(0, 12).map((m) => {
              const max = result.knowledgePointMiss[0].count;
              return (
                <li key={m.knowledgePoint} className="flex items-center gap-3 text-sm">
                  <Link
                    href={`/practice?bank=${result.bank}&scope=${m.knowledgePoint}`}
                    className="w-20 flex-none font-mono text-xs text-[var(--accent-text)] hover:underline"
                  >
                    {m.knowledgePoint}
                  </Link>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <span
                      className="block h-full rounded-full bg-[var(--danger)]"
                      style={{ width: `${(m.count / max) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 flex-none text-right font-mono text-xs text-[var(--text-subtle)]">
                    {m.count} 题
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">逐题复盘</h2>
          <div className="ml-auto flex gap-1">
            {(
              [
                ["wrong", `错题 ${wrongItems.length}`],
                ["blank", `未答 ${blankItems.length}`],
                ["all", `全部 ${items.length}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`btn btn-sm ${filter === key ? "btn-primary" : "btn-ghost"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            {filter === "wrong" && wrongItems.length === 0
              ? "本次考试没有错题，表现很好。"
              : filter === "blank"
                ? "本次考试全部作答完毕。"
                : "没有可显示的题目。"}
          </p>
        ) : (
          <ReviewQuestionList
            bank={result.bank}
            rows={shown.map((x) => ({
              key: x.key,
              question: x.question,
              picked: x.picked,
              ok: x.ok,
            }))}
            defaultOpen={shown.length <= 5 ? "all" : "none"}
          />
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-subtle)]">{label}</dt>
      <dd
        className={`font-mono tabular-nums ${
          tone === "success"
            ? "text-[var(--success)]"
            : tone === "danger"
              ? "text-[var(--danger)]"
              : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} 分 ${s % 60} 秒` : `${s} 秒`;
}
