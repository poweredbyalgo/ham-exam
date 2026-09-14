"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { QuestionCard, type AnswerState, evaluate } from "@/components/question-card";
import { ProgressBar } from "@/components/progress-bar";
import { ScopeOptions, ScopePicker, scopeLabel } from "@/components/scope-picker";
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
    <div className="practice-page space-y-2 sm:space-y-4">
      {/* 桌面端筛选栏；手机端整条隐藏，改由 header 中的入口（MobileFilters
          通过 portal 挂到 #header-actions）以底部弹层形式提供同样的筛选。 */}
      <div className="card hidden flex-nowrap items-center gap-2 p-3 sm:flex">
        <BankTabs bank={bank} mode={mode} />
        <div className="h-5 w-px bg-[var(--border)]" aria-hidden />
        <ModeTabs bank={bank} scope={scope} mode={mode} />
        <ScopePicker bank={bank} scope={scope} mode={mode} className="ml-auto min-w-0" />
      </div>

      <MobileFilters bank={bank} scope={scope} mode={mode} />

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
            {/* 说明文字只在 ≥sm 显示，手机上把这一行的高度让给题目 */}
            <span className="hidden text-xs text-[var(--text-subtle)] sm:inline">
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

      {mode === "practice" && (
        <p className="hidden px-1 text-xs leading-relaxed text-[var(--text-subtle)] sm:block">
          多选题需选全所有正确选项才算答对。
          <Link
            href={`/browse?bank=${bank}&scope=${scope}&i=${pos}`}
            className="ml-1 text-[var(--accent-text)] underline"
          >
            在题库中查看本题
          </Link>
        </p>
      )}

      {/* 底部操作条：手机上「上一题 / 下一题」只保留图标（触控目标不变），
          中间主操作拉伸占满剩余宽度，「重做本题」也收为图标，
          整条始终单行，不随文案换行占掉题目空间。 */}
      <StickyActions>
        <button
          type="button"
          className="btn flex-none px-3"
          onClick={() => goTo(pos - 1)}
          disabled={pos === 0}
          aria-label="上一题"
        >
          <ChevronIcon dir="left" />
          <span className="hidden sm:inline">上一题</span>
        </button>

        {mode === "practice" &&
          (state === "idle" ? (
            <button
              type="button"
              className="btn btn-primary min-w-0 flex-1 sm:flex-none"
              onClick={() => void submit()}
              disabled={selected.length === 0}
            >
              提交答案
            </button>
          ) : (
            <span
              className={`chip justify-center flex-1 sm:flex-none ${
                state === "correct" ? "chip-success" : "chip-danger"
              }`}
              role="status"
            >
              {state === "correct" ? "回答正确" : "回答错误"}
            </span>
          ))}

        {mode === "memorize" && (
          <span className="min-w-0 flex-1 text-center text-xs text-[var(--text-subtle)] sm:flex-none">
            第 {pos + 1} / {pool.length} 题
          </span>
        )}

        <button
          type="button"
          className="btn flex-none px-3"
          onClick={() => goTo(pos + 1)}
          disabled={pos >= pool.length - 1}
          aria-label="下一题"
        >
          <span className="hidden sm:inline">下一题</span>
          <ChevronIcon dir="right" />
        </button>

        {mode === "practice" && (
          <button
            type="button"
            className="btn btn-ghost flex-none px-3"
            onClick={() => {
              setSelected([]);
              setState("idle");
            }}
            disabled={state === "idle" && selected.length === 0}
            aria-label="重做本题"
            title="重做本题"
          >
            <RedoIcon />
            <span className="hidden sm:inline">重做本题</span>
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
    </div>
  );
}

function BankTabs({ bank, mode }: { bank: BankId; mode: Mode }) {
  return (
    <div
      className="flex flex-none items-center gap-0.5 rounded-lg bg-[var(--surface-2)] p-0.5"
      role="group"
      aria-label="选择题库"
    >
      {BANK_IDS.map((b) => (
        <Link
          key={b}
          href={`/practice?bank=${b}${mode === "memorize" ? "&mode=memorize" : ""}`}
          aria-current={b === bank ? "page" : undefined}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            b === bank
              ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
              : "text-[var(--text-muted)]"
          }`}
        >
          {BANK_NAMES[b]}
        </Link>
      ))}
    </div>
  );
}

function ModeTabs({
  bank,
  scope,
  mode,
}: {
  bank: BankId;
  scope: string;
  mode: Mode;
}) {
  return (
    <div
      className="flex flex-none items-center gap-0.5 rounded-lg bg-[var(--surface-2)] p-0.5"
      role="group"
      aria-label="切换模式"
    >
      <Link
        href={`/practice?bank=${bank}&scope=${scope}`}
        aria-current={mode === "practice" ? "page" : undefined}
        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
          mode === "practice"
            ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
            : "text-[var(--text-muted)]"
        }`}
      >
        练习
      </Link>
      <Link
        href={`/practice?bank=${bank}&scope=${scope}&mode=memorize`}
        aria-current={mode === "memorize" ? "page" : undefined}
        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
          mode === "memorize"
            ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
            : "text-[var(--text-muted)]"
        }`}
      >
        背题
      </Link>
    </div>
  );
}

/**
 * 手机端筛选入口：把题库 / 模式 / 范围收进 header 右侧的一个按钮，
 * 点击后以底部弹层展示全部筛选。页面顶部不再占用一整行卡片，
 * 题目从折叠线上方就开始显示。
 *
 * 通过 portal 挂到 Nav 预留的 #header-actions 插槽（该插槽 ≥sm 隐藏，
 * 因此这里无需再做响应式判断）。
 */
function MobileFilters({
  bank,
  scope,
  mode,
}: {
  bank: BankId;
  scope: string;
  mode: Mode;
}) {
  const router = useRouter();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSlot(document.getElementById("header-actions"));
  }, []);

  // 弹层单独 portal 到 body：header 有 backdrop-filter，会把 fixed 后代
  // 的包含块限制在 header 内，底部弹层必须挂在 body 下才能贴住视口。

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!slot) return null;

  const pick = (nextScope: string) => {
    setOpen(false);
    const qs = new URLSearchParams({ bank, scope: nextScope });
    if (mode === "memorize") qs.set("mode", "memorize");
    router.push(`/practice?${qs.toString()}`);
  };

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={open}
      aria-haspopup="dialog"
      className="btn btn-sm min-w-0 max-w-[15rem] px-2"
    >
      <span className="font-semibold">{bank}</span>
      <span aria-hidden className="text-[var(--text-subtle)]">
        ·
      </span>
      <span className="flex-none">{mode === "memorize" ? "背题" : "练习"}</span>
      <span aria-hidden className="text-[var(--text-subtle)]">
        ·
      </span>
      <span className="min-w-0 truncate">{scopeLabel(bank, scope)}</span>
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden className="flex-none">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );

  const sheet = open ? (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="筛选设置"
      onClick={() => setOpen(false)}
    >
      <div
        className="mx-auto max-h-[75dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">筛选</h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen(false)}
          >
            完成
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BankTabs bank={bank} mode={mode} />
          <ModeTabs bank={bank} scope={scope} mode={mode} />
        </div>
        <div className="mt-3 border-t border-[var(--border)] pt-2">
          <ScopeOptions bank={bank} scope={scope} onPick={pick} />
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {createPortal(trigger, slot)}
      {sheet && createPortal(sheet, document.body)}
    </>
  );
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={dir === "left" ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
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
