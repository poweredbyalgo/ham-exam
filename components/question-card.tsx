"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { isCorrect, OPTION_LETTERS } from "@/lib/question-bank";
import type { BankId, Question } from "@/lib/types";

/**
 * 附图展示。题图多为电路图/天线图，带放大查看。
 * 使用原生 <img>（并非常量优化的 next/image）：图片来自本地 public/，
 * 已经是压缩后的小尺寸 JPEG，且需要离线可用与固定显示尺寸。
 */
export function FigureView({
  file,
  compact = false,
}: {
  file: string;
  compact?: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const url = `/figures/${file.toLowerCase()}`;

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setZoom(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoom]);

  return (
    <>
      <figure className="mt-3">
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="group relative block w-full overflow-hidden rounded-lg border border-[var(--border)] bg-white p-2"
          aria-label="放大查看附图"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`附图 ${file}`}
            loading="lazy"
            className={`mx-auto w-auto object-contain ${
              compact ? "max-h-40" : "max-h-72"
            }`}
          />
          <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
            点击放大
          </span>
        </button>
        <figcaption className="mt-1 text-center text-xs text-[var(--text-subtle)]">
          附图 {file.replace(/\.jpg$/i, "")}
        </figcaption>
      </figure>

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`附图 ${file}`}
          onClick={() => setZoom(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`附图 ${file}`}
            className="max-h-full max-w-full rounded-lg bg-white object-contain p-3"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-white/15 px-3 py-1.5 text-sm text-white backdrop-blur"
            onClick={() => setZoom(false)}
          >
            关闭 (Esc)
          </button>
        </div>
      )}
    </>
  );
}

export type AnswerState = "idle" | "correct" | "wrong";

interface QuestionCardProps {
  bank: BankId;
  question: Question;
  /** 当前选中项（受控） */
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  /** 已提交的判定结果；idle 表示尚未提交 */
  state: AnswerState;
  /** 直接展示答案（背题模式 / 考试复盘） */
  reveal?: boolean;
  /** 是否允许键盘操作 */
  keyboard?: boolean;
  /** 提交回调（Enter 键触发） */
  onSubmit?: () => void;
  /** 下一题回调（→ 键触发） */
  onNext?: () => void;
  /** 上一题回调（← 键触发） */
  onPrev?: () => void;
  /** 收藏切换 */
  starred?: boolean;
  onToggleStar?: () => void;
  /** 题号显示，如 "12 / 683" */
  positionLabel?: string;
  showFigure?: boolean;
  /**
   * 只显示正确答案，不展示全部选项（背题模式的「只看答案」）。
   * 需要在 reveal 为 true 时才有意义。
   */
  answerOnly?: boolean;
}

export function QuestionCard({
  bank,
  question,
  selected,
  onSelectedChange,
  state,
  reveal = false,
  keyboard = true,
  onSubmit,
  onNext,
  onPrev,
  starred,
  onToggleStar,
  positionLabel,
  showFigure = true,
  answerOnly = false,
}: QuestionCardProps) {
  const multi = question.type === "multiple";
  const submitted = state !== "idle" || reveal;
  const answerLetters = question.answer.split("");
  const hideOptions = reveal && answerOnly;

  const toggle = (letter: string) => {
    if (submitted) return;
    if (multi) {
      onSelectedChange(
        selected.includes(letter)
          ? selected.filter((l) => l !== letter)
          : [...selected, letter].sort(),
      );
    } else {
      onSelectedChange([letter]);
    }
  };

  // 键盘快捷键：A–D 选择，Enter 提交/下一题，方向键翻题，S 收藏。
  // 用 useEffectEvent 拿到总是最新、又不参与依赖数组的处理器，
  // 这样监听器只注册一次，同时始终读到当前的 selected / submitted 状态。
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;

    const key = e.key.toUpperCase();
    if (key >= "A" && key <= "D" && key.length === 1) {
      e.preventDefault();
      toggle(key);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!submitted && selected.length > 0) onSubmit?.();
      else if (submitted) onNext?.();
      return;
    }
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      onNext?.();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      onPrev?.();
      return;
    }
    if (key === "S" && onToggleStar) {
      e.preventDefault();
      onToggleStar();
    }
    if (e.key === " " && multi && !submitted && selected.length > 0) {
      e.preventDefault();
      onSubmit?.();
    }
  });

  useEffect(() => {
    if (!keyboard) return;
    const listener = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [keyboard]);

  const optionClass = (letter: string) => {
    if (!submitted) return selected.includes(letter) ? "option option-selected" : "option";
    const isAnswer = answerLetters.includes(letter);
    const chosen = selected.includes(letter);
    if (isAnswer) return "option option-correct";
    if (chosen) return "option option-wrong";
    return "option opacity-60";
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {positionLabel && (
          <span className="font-mono text-[var(--text-subtle)]">{positionLabel}</span>
        )}
        <span className={multi ? "chip chip-warn" : "chip"}>
          {multi ? "多选题" : "单选题"}
        </span>
        <span className="chip">{bank} 类</span>
        <span className="chip">知识点 {question.knowledgePoint}</span>
        {question.bankId ? (
          <span className="chip font-mono">{question.bankId}</span>
        ) : (
          <span className="chip chip-warn" title="源题库中该题的总题库编号为空">
            编号缺失
          </span>
        )}
        <span className="chip font-mono">{question.questionId}</span>
        {onToggleStar && (
          <button
            type="button"
            onClick={onToggleStar}
            className="btn btn-ghost btn-sm ml-auto"
            aria-pressed={starred}
            title="收藏本题（快捷键 S）"
          >
            <StarIcon filled={!!starred} />
            {starred ? "已收藏" : "收藏"}
          </button>
        )}
      </div>

      <h2 className="mt-3 text-[1.0625rem] font-medium leading-relaxed">
        {question.stem}
      </h2>

      {showFigure && question.figure && <FigureView file={question.figure} />}

      {hideOptions ? (
        /* 背题模式「只看答案」：直接给出正确答案，不展示全部选项，
           让注意力落在「题干 → 答案」这一对映射上 */
        <div className="mt-4 rounded-xl border border-[var(--success)]/40 bg-[var(--success-soft)] p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--success)]">
            <span className="font-medium">
              {multi ? "多项选择 · 正确答案" : "单项选择 · 正确答案"}
            </span>
            <span className="font-mono font-semibold tracking-wider">
              {question.answer}
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {answerLetters.map((letter) => (
              <li key={letter} className="flex gap-2.5">
                <span className="option-key bg-[var(--success)] text-white">
                  {letter}
                </span>
                <span className="flex-1 text-[0.9375rem] leading-relaxed text-[var(--text)]">
                  {question.options[letter.charCodeAt(0) - 65]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {OPTION_LETTERS.map((letter, i) => (
              <li key={letter}>
                <button
                  type="button"
                  className={optionClass(letter)}
                  onClick={() => toggle(letter)}
                  disabled={submitted}
                  aria-pressed={selected.includes(letter)}
                >
                  <span className="option-key">{letter}</span>
                  <span className="flex-1">{question.options[i]}</span>
                  {submitted && answerLetters.includes(letter) && (
                    <span className="flex-none self-center text-xs font-medium text-[var(--success)]">
                      正确答案
                    </span>
                  )}
                  {submitted &&
                    !answerLetters.includes(letter) &&
                    selected.includes(letter) && (
                      <span className="flex-none self-center text-xs font-medium text-[var(--danger)]">
                        你的选择
                      </span>
                    )}
                </button>
              </li>
            ))}
          </ul>

          {reveal && !multi && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              本题为单选题，正确答案：
              <strong className="text-[var(--success)]">{question.answer}</strong>
            </p>
          )}
          {reveal && multi && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              本题为多选题，正确答案：
              <strong className="text-[var(--success)]">
                {answerLetters
                  .map((l) => `${l}. ${question.options[l.charCodeAt(0) - 65]}`)
                  .join("　")}
              </strong>
            </p>
          )}
        </>
      )}

      {keyboard && (
        <p className="mt-4 hidden items-center gap-2 text-xs text-[var(--text-subtle)] sm:flex">
          <span className="kbd">A</span>–<span className="kbd">D</span> 选择
          {multi && (
            <>
              <span className="ml-1">可多选</span>
            </>
          )}
          <span className="kbd ml-2">Enter</span> {submitted ? "下一题" : "提交"}
          <span className="kbd ml-2">←</span>
          <span className="kbd">→</span> 翻题
          {onToggleStar && (
            <>
              <span className="kbd ml-2">S</span> 收藏
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function evaluate(question: Question, selected: string[]): AnswerState {
  if (selected.length === 0) return "idle";
  return isCorrect(selected, question.answer) ? "correct" : "wrong";
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill={filled ? "var(--star)" : "none"}
      stroke={filled ? "var(--star)" : "currentColor"}
      strokeWidth={1.8}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z" />
    </svg>
  );
}
