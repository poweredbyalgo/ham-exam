"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { QuestionCard, type AnswerState, evaluate } from "@/components/question-card";
import { ProgressBar } from "@/components/progress-bar";
import { ScopePicker } from "@/components/scope-picker";
import { StickyActions } from "@/components/sticky-actions";
import {
  BANK_IDS,
  BANK_NAMES,
  bankMeta,
  displayQuestion,
  filterByScope,
  getQuestions,
  isBankId,
  knowledgePoints,
  optionSpace,
  questionKey,
} from "@/lib/question-bank";
import {
  isStarred,
  recordAttempt,
  saveSeqCursor,
  seqCursor,
  statOf,
  toggleStar,
  updateSettings,
} from "@/lib/store";
import { useStore } from "@/lib/use-store";
import type { BankId } from "@/lib/types";

type Mode = "practice" | "memorize";

export function PracticeClient() {
  const params = useSearchParams();
  const router = useRouter();
  const { ready, settings } = useStore();

  const bankParam = params.get("bank");
  const bank: BankId = isBankId(bankParam) ? bankParam : "A";
  const scope = params.get("scope") ?? "all";
  const mode: Mode = params.get("mode") === "memorize" ? "memorize" : "practice";
  const indexParam = params.get("i");

  const pool = useMemo(() => filterByScope(bank, scope), [bank, scope]);
  const seqId = `${bank}:${scope}:${mode}`;

  // 位置不在 state 里重复保存，而是每次渲染推导：
  //   1) URL 的 ?i= 优先（可分享、可回退）
  //   2) 否则用上次保存的断点（只在 ready 后可用，避免服务端渲染读到空值）
  // 这样导航只需 push URL，不需要 effect 回写 state。
  const [posOverride, setPosOverride] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<AnswerState>("idle");

  const last = Math.max(0, pool.length - 1);
  const fromUrl = indexParam !== null && indexParam !== "" ? Number(indexParam) : NaN;
  const pos = Math.max(
    0,
    Math.min(
      last,
      posOverride ??
        (Number.isFinite(fromUrl) ? fromUrl : ready ? seqCursor(seqId) : 0),
    ),
  );

  const question = pool[pos];

  // 选项乱序：按题目 ID 确定性打乱，答案字母同步重映射。
  // 渲染与交互用「显示空间」，判分与存盘换算回「原始空间」，
  // 因此切换乱序开关不会让已保存的作答错位。
  const space = useMemo(
    () => (question ? optionSpace(question, settings.shuffleOptions) : null),
    [question, settings.shuffleOptions],
  );
  const shown = useMemo(
    () => (question ? displayQuestion(question, settings.shuffleOptions) : question),
    [question, settings.shuffleOptions],
  );

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(pool.length - 1, next));
      setPosOverride(clamped);
      setSelected([]);
      setState("idle");
      void saveSeqCursor(seqId, clamped);
      // 用 replace 避免把每个题号都压进浏览器历史
      const qs = new URLSearchParams();
      qs.set("bank", bank);
      if (scope !== "all") qs.set("scope", scope);
      if (mode === "memorize") qs.set("mode", mode);
      qs.set("i", String(clamped));
      router.replace(`/practice?${qs.toString()}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [pool.length, seqId, bank, scope, mode, router],
  );

  const submit = useCallback(async () => {
    if (!question || !space || selected.length === 0 || state !== "idle") return;
    // selected 是显示空间的字母，先换算回原始空间再判分与存盘
    const sourceSelected = space.toSourceSelected(selected);
    const result = evaluate(question, sourceSelected);
    setState(result);
    await recordAttempt({
      bank,
      question,
      selected: sourceSelected,
      source: "practice",
    });
    if (result === "correct" && settings.autoNext) {
      window.setTimeout(() => goTo(pos + 1), 420);
    }
  }, [question, space, selected, state, bank, pos, goTo, settings.autoNext]);

  if (!ready) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-full rounded-lg" />
        <div className="skeleton h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (pool.length === 0) {
    return (
      <EmptyState bank={bank} />
    );
  }

  const key = questionKey(bank, question);
  const stat = statOf(key);
  const answered = stat?.attempts ?? 0;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex items-center gap-1">
          {BANK_IDS.map((b) => (
            <Link
              key={b}
              href={`/practice?bank=${b}${mode === "memorize" ? "&mode=memorize" : ""}`}
              className={`btn btn-sm ${b === bank ? "btn-primary" : "btn-ghost"}`}
            >
              {BANK_NAMES[b]}
            </Link>
          ))}
        </div>

        <div className="h-5 w-px bg-[var(--border)]" aria-hidden />

        <div className="flex items-center gap-1">
          <Link
            href={`/practice?bank=${bank}&scope=${scope}`}
            className={`btn btn-sm ${mode === "practice" ? "btn-primary" : "btn-ghost"}`}
          >
            练习
          </Link>
          <Link
            href={`/practice?bank=${bank}&scope=${scope}&mode=memorize`}
            className={`btn btn-sm ${mode === "memorize" ? "btn-primary" : "btn-ghost"}`}
          >
            背题
          </Link>
        </div>

        <ScopePicker bank={bank} scope={scope} mode={mode} className="ml-auto" />
      </div>

      <div className="card p-3">
        <div className="flex items-center gap-3">
          <span className="flex-none font-mono text-xs text-[var(--text-subtle)]">
            {pos + 1} / {pool.length}
          </span>
          <div className="flex-1">
            <ProgressBar value={pos + 1} max={pool.length} />
          </div>
          {answered > 0 && (
            <span className="hidden flex-none text-xs text-[var(--text-subtle)] sm:block">
              本题已练 {answered} 次
              {stat && stat.wrong > 0 && !stat.mastered && (
                <span className="ml-1 text-[var(--danger)]">· 错题</span>
              )}
            </span>
          )}
        </div>

        {/* 背题模式的展示方式切换：全部选项 / 只看答案。
            选择会写入设置，下次进背题模式默认沿用。 */}
        {mode === "memorize" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
            <span className="text-xs text-[var(--text-subtle)]">显示方式</span>
            <div className="flex gap-1" role="group" aria-label="背题显示方式">
              <button
                type="button"
                aria-pressed={!settings.recallAnswerOnly}
                className={`btn btn-sm ${!settings.recallAnswerOnly ? "btn-primary" : ""}`}
                onClick={() => void updateSettings({ recallAnswerOnly: false })}
              >
                全部选项
              </button>
              <button
                type="button"
                aria-pressed={settings.recallAnswerOnly}
                className={`btn btn-sm ${settings.recallAnswerOnly ? "btn-primary" : ""}`}
                onClick={() => void updateSettings({ recallAnswerOnly: true })}
              >
                只看答案
              </button>
            </div>
            <span className="text-xs text-[var(--text-subtle)]">
              {settings.recallAnswerOnly
                ? "只给出正确答案，适合快速记忆「题干 → 答案」"
                : "展示全部选项并标出正确答案"}
            </span>
          </div>
        )}
      </div>

      <QuestionCard
        bank={bank}
        question={shown}
        selected={mode === "memorize" ? shown.answer.split("") : selected}
        onSelectedChange={setSelected}
        state={mode === "memorize" ? "idle" : state}
        reveal={mode === "memorize"}
        answerOnly={mode === "memorize" && settings.recallAnswerOnly}
        keyboard={mode !== "memorize"}
        onSubmit={submit}
        onNext={() => goTo(pos + 1)}
        onPrev={() => goTo(pos - 1)}
        starred={isStarred(key)}
        onToggleStar={() => void toggleStar(key)}
        positionLabel={`第 ${pos + 1} 题`}
        showFigure={settings.showFigure}
      />

      <StickyActions>
        <button
          type="button"
          className="btn flex-none"
          onClick={() => goTo(pos - 1)}
          disabled={pos === 0}
        >
          ← 上一题
        </button>

        {mode === "practice" &&
          (state === "idle" ? (
            <button
              type="button"
              className="btn btn-primary flex-none"
              onClick={() => void submit()}
              disabled={selected.length === 0}
            >
              提交答案
            </button>
          ) : (
            <span
              className={`chip flex-none ${
                state === "correct" ? "chip-success" : "chip-danger"
              }`}
              role="status"
            >
              {state === "correct" ? "回答正确" : "回答错误"}
            </span>
          ))}

        <button
          type="button"
          className="btn flex-none"
          onClick={() => goTo(pos + 1)}
          disabled={pos >= pool.length - 1}
        >
          下一题 →
        </button>

        {mode === "practice" && (
          <button
            type="button"
            className="btn btn-ghost flex-none"
            onClick={() => {
              setSelected([]);
              setState("idle");
            }}
            disabled={state === "idle" && selected.length === 0}
          >
            重做本题
          </button>
        )}

        <span className="ml-auto hidden text-xs text-[var(--text-subtle)] sm:block">
          {mode === "memorize" ? (
            "背题模式不计入正确率"
          ) : (
            <>
              错题自动进
              <Link href="/review" className="mx-1 text-[var(--accent-text)] underline">
                错题本
              </Link>
              ，连对 {settings.autoRemoveStreak || "—"} 次移出
            </>
          )}
        </span>
      </StickyActions>

      {mode === "practice" && (
        <p className="px-1 text-xs leading-relaxed text-[var(--text-subtle)]">
          多选题需选全所有正确选项才算答对。
          <Link
            href={`/browse?bank=${bank}&scope=${scope}&i=${pos}`}
            className="ml-1 text-[var(--accent-text)] underline"
          >
            在题库中查看本题
          </Link>
        </p>
      )}
    </div>
  );
}

function EmptyState({ bank }: { bank: BankId }) {
  const all = getQuestions(bank);
  return (
    <div className="card p-6 text-center">
      <p className="text-sm text-[var(--text-muted)]">
        {bankMeta[bank].sourceFile} 的第 {knowledgePoints(bank).length} 个知识点中，
        当前筛选条件下没有题目。
      </p>
      <p className="mt-1 text-xs text-[var(--text-subtle)]">
        该题库共 {all.length} 题。
      </p>
      <Link href={`/practice?bank=${bank}`} className="btn btn-primary mt-4">
        查看全部题目
      </Link>
    </div>
  );
}
