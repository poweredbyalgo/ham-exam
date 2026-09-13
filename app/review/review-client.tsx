"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { QuestionCard, type AnswerState, evaluate } from "@/components/question-card";
import { ReviewQuestionList, type ReviewRowData } from "@/components/review-list";
import {
  BANK_IDS,
  BANK_NAMES,
  getQuestion,
} from "@/lib/question-bank";
import {
  masteredCount,
  recordAttempt,
  setMastered,
  starredKeys,
  statOf,
  toggleStar,
  wrongBookKeys,
} from "@/lib/store";
import { useStore } from "@/lib/use-store";
import type { BankId } from "@/lib/types";

type Tab = "wrong" | "star" | "mastered";

export function ReviewClient() {
  const params = useSearchParams();
  const bankParam = params.get("bank");
  const bank: BankId | "all" =
    bankParam === "A" || bankParam === "B" || bankParam === "C" ? bankParam : "all";
  const tab = (params.get("tab") as Tab) ?? "wrong";
  const redo = params.get("redo") === "1";

  const { ready, stats, settings } = useStore();

  // 关键：所有 Hook 必须在任何 early return 之前调用，
  // 否则 ready 由 false 变 true 时 Hook 数量变化会触发 React error #310。
  const keys = useMemo(() => {
    if (!ready) return [] as string[];
    if (tab === "star") return starredKeys(bank === "all" ? undefined : bank);
    if (tab === "mastered") {
      return Object.values(stats)
        .filter(
          (s) =>
            s.mastered && s.wrong > 0 && (bank === "all" || s.bank === bank),
        )
        .sort((a, b) => b.lastAt - a.lastAt)
        .map((s) => s.key);
    }
    return wrongBookKeys(bank === "all" ? undefined : bank);
  }, [ready, tab, bank, stats]);

  const bankCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const b of BANK_IDS) counts[b] = 0;
    for (const key of keys) {
      const located = getQuestion(key);
      if (!located) continue;
      counts[located.bank] += 1;
      counts.all += 1;
    }
    return counts;
  }, [keys]);

  if (!ready) {
    return <div className="skeleton h-64 w-full rounded-xl" />;
  }

  if (redo) {
    return <RedoRunner bank={bank} tab={tab} />;
  }

  const rows: ReviewRowData[] = [];
  for (const key of keys) {
    const located = getQuestion(key);
    if (!located) continue;
    const stat = statOf(key);
    rows.push({
      key,
      question: located.question,
      picked: stat?.lastOutcome === "correct" ? located.question.answer.split("") : [],
      ok: stat?.lastOutcome === "correct",
    });
  }

  const starredSet = new Set(starredKeys());

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "wrong", label: "错题本", count: wrongBookKeys().length },
    { id: "star", label: "收藏夹", count: starredKeys().length },
    { id: "mastered", label: "已掌握", count: masteredCount() },
  ];

  return (
    <div className="space-y-4">
      <header className="card p-4">
        <h1 className="text-lg font-semibold">错题本与收藏</h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
          练习和考试中答错的题会自动收录，连续答对{" "}
          {settings.autoRemoveStreak || "—"} 次后自动移出。也可以手动标记
          「已掌握」或收藏重点题。
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={buildHref(bank, t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`btn btn-sm ${tab === t.id ? "btn-primary" : ""}`}
            >
              {t.label}
              <span className="font-mono text-xs opacity-70">{t.count}</span>
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href={buildHref("all", tab)}
            className={`btn btn-sm ${bank === "all" ? "btn-primary" : "btn-ghost"}`}
          >
            全部
          </Link>
          {BANK_IDS.map((b) => (
            <Link
              key={b}
              href={buildHref(b, tab)}
              className={`btn btn-sm ${bank === b ? "btn-primary" : "btn-ghost"}`}
            >
              {BANK_NAMES[b]}
              <span className="font-mono text-xs opacity-60">{bankCounts[b]}</span>
            </Link>
          ))}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildHref(bank, tab, true)}
            className="btn btn-primary btn-sm"
          >
            逐题重做（{rows.length} 题）
          </Link>
          {tab === "wrong" && (
            <span className="text-xs text-[var(--text-subtle)]">
              重做时按顺序出题，答对后可自动移出错题本
            </span>
          )}
        </div>
      )}

      <section className="card p-4">
        <ReviewQuestionList
          bank={bank === "all" ? "A" : bank}
          rows={rows}
          emptyHint={
            tab === "wrong"
              ? "错题本是空的。开始练习后，答错的题会自动出现在这里。"
              : tab === "star"
                ? "还没有收藏题目。在练习界面点击「收藏」或按 S 键即可加入。"
                : "还没有标记为已掌握的题目。"
          }
          onMastered={(key, mastered) => void setMastered(key, mastered)}
          onToggleStar={(key) => void toggleStar(key)}
          starredKeys={starredSet}
        />
      </section>

      {rows.length === 0 && tab === "wrong" && (
        <div className="flex gap-2">
          <Link href="/practice" className="btn btn-primary">
            开始练习
          </Link>
          <Link href="/exam" className="btn">
            模拟考试
          </Link>
        </div>
      )}
    </div>
  );
}

function buildHref(bank: BankId | "all", tab: Tab, redo = false): string {
  const qs = new URLSearchParams();
  if (bank !== "all") qs.set("bank", bank);
  if (tab !== "wrong") qs.set("tab", tab);
  if (redo) qs.set("redo", "1");
  const s = qs.toString();
  return s ? `/review?${s}` : "/review";
}

// ---------------------------------------------------------------- 逐题重做

function RedoRunner({ bank, tab }: { bank: BankId | "all"; tab: Tab }) {
  const { stats } = useStore();
  const keys = useMemo(() => {
    if (tab === "star") return starredKeys(bank === "all" ? undefined : bank);
    if (tab === "mastered") {
      return Object.values(stats)
        .filter((s) => s.mastered && s.wrong > 0 && (bank === "all" || s.bank === bank))
        .map((s) => s.key);
    }
    return wrongBookKeys(bank === "all" ? undefined : bank);
  }, [bank, tab, stats]);

  const [pos, setPos] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<AnswerState>("idle");
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });

  const located = keys[pos] ? getQuestion(keys[pos]) : null;

  if (keys.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-[var(--text-muted)]">没有需要重做的题目。</p>
        <Link href="/review" className="btn btn-primary mt-4">
          返回列表
        </Link>
      </div>
    );
  }

  if (pos >= keys.length) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-lg font-semibold">重做完成</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          答对 <strong className="text-[var(--success)]">{tally.correct}</strong> 题，
          答错 <strong className="text-[var(--danger)]">{tally.wrong}</strong> 题。
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/review" className="btn btn-primary">
            返回错题本
          </Link>
          <Link href="/stats" className="btn">
            查看统计
          </Link>
        </div>
      </div>
    );
  }

  const question = located!.question;
  const bankId = located!.bank;

  const go = (next: number) => {
    setPos(next);
    setSelected([]);
    setState("idle");
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    if (selected.length === 0 || state !== "idle") return;
    const result = evaluate(question, selected);
    setState(result);
    setTally((t) => ({
      correct: t.correct + (result === "correct" ? 1 : 0),
      wrong: t.wrong + (result === "wrong" ? 1 : 0),
    }));
    await recordAttempt({ bank: bankId, question, selected, source: "review" });
    if (result === "correct") {
      window.setTimeout(() => go(pos + 1), 600);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-3 p-3">
        <span className="font-mono text-sm">
          {pos + 1}
          <span className="text-[var(--text-subtle)]">/{keys.length}</span>
        </span>
        <span className="chip chip-success">对 {tally.correct}</span>
        <span className="chip chip-danger">错 {tally.wrong}</span>
        <Link href={buildHref(bank, tab)} className="btn btn-ghost btn-sm ml-auto">
          退出重做
        </Link>
      </div>

      <QuestionCard
        bank={bankId}
        question={question}
        selected={selected}
        onSelectedChange={setSelected}
        state={state}
        onSubmit={() => void submit()}
        onNext={() => go(pos + 1)}
        onPrev={() => go(pos - 1)}
        starred={statOf(keys[pos])?.starred}
        onToggleStar={() => void toggleStar(keys[pos])}
        positionLabel={`第 ${pos + 1} 题`}
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => go(pos - 1)} disabled={pos === 0}>
          ← 上一题
        </button>
        {state === "idle" ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={selected.length === 0}
          >
            提交答案
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => go(pos + 1)}>
            下一题 →
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => go(pos + 1)}>
          跳过
        </button>
      </div>
    </div>
  );
}
