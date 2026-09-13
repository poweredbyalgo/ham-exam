"use client";

import Link from "next/link";
import { useState } from "react";
import { QuestionCard } from "@/components/question-card";
import { OPTION_LETTERS, figureUrl } from "@/lib/question-bank";
import type { BankId, Question } from "@/lib/types";

export interface ReviewRowData {
  key: string;
  question: Question;
  /** 用户作答；空数组表示未作答 */
  picked: string[];
  ok: boolean;
}

/**
 * 逐题复盘列表。默认折叠，展开后直接显示题目、正确答案与附图；
 * 同时提供「重做本题」「移出错题本」等操作。
 */
export function ReviewQuestionList({
  bank,
  rows,
  defaultOpen = "none",
  onMastered,
  onToggleStar,
  starredKeys,
  emptyHint,
}: {
  bank: BankId;
  rows: ReviewRowData[];
  defaultOpen?: "none" | "all";
  onMastered?: (key: string, mastered: boolean) => void;
  onToggleStar?: (key: string) => void;
  starredKeys?: Set<string>;
  emptyHint?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    defaultOpen === "all" ? new Set(rows.map((r) => r.key)) : new Set(),
  );
  const [allOpen, setAllOpen] = useState(defaultOpen === "all");

  if (rows.length === 0) {
    return (
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        {emptyHint ?? "这里还没有题目。"}
      </p>
    );
  }

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allOpen) {
      setExpanded(new Set());
      setAllOpen(false);
    } else {
      setExpanded(new Set(rows.map((r) => r.key)));
      setAllOpen(true);
    }
  };

  return (
    <div className="mt-3">
      <div className="mb-2 flex justify-end">
        <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAll}>
          {allOpen ? "全部收起" : "全部展开"}
        </button>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const open = expanded.has(row.key);
          const q = row.question;
          const starred = starredKeys?.has(row.key) ?? false;
          return (
            <li
              key={row.key}
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            >
              <div className="flex items-start gap-2 p-3">
                <button
                  type="button"
                  onClick={() => toggle(row.key)}
                  aria-expanded={open}
                  className="flex flex-1 items-start gap-3 text-left"
                >
                  <span
                    className={`mt-0.5 flex-none rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                      row.ok
                        ? "bg-[var(--success-soft)] text-[var(--success)]"
                        : row.picked.length === 0
                          ? "bg-[var(--warn-soft)] text-[var(--warn)]"
                          : "bg-[var(--danger-soft)] text-[var(--danger)]"
                    }`}
                  >
                    {row.ok ? "正确" : row.picked.length === 0 ? "未答" : "错误"}
                  </span>
                  <span className="flex-1">
                    <span className="line-clamp-2 text-sm leading-relaxed">
                      {q.stem}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-subtle)]">
                      <span className="font-mono">{q.questionId}</span>
                      <span>知识点 {q.knowledgePoint}</span>
                      {q.type === "multiple" && <span className="chip chip-warn">多选</span>}
                      {q.figure && (
                        <a
                          href={figureUrl(q.figure)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--accent-text)] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          含附图
                        </a>
                      )}
                    </span>
                  </span>
                  <span aria-hidden className="flex-none text-[var(--text-subtle)]">
                    {open ? "▾" : "▸"}
                  </span>
                </button>
              </div>

              {open && (
                <div className="border-t border-[var(--border)] p-3">
                  <QuestionCard
                    bank={bank}
                    question={q}
                    selected={row.picked}
                    onSelectedChange={() => {}}
                    state={row.ok ? "correct" : "wrong"}
                    keyboard={false}
                    showFigure
                    positionLabel={`第 ${q.index} 题`}
                    starred={starred}
                    onToggleStar={
                      onToggleStar ? () => onToggleStar(row.key) : undefined
                    }
                  />

                  {!row.ok && (
                    <div className="mt-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs">
                      <span className="text-[var(--text-subtle)]">你的作答：</span>
                      <span className="font-mono text-[var(--danger)]">
                        {row.picked.length > 0 ? row.picked.join("") : "未作答"}
                      </span>
                      <span className="ml-3 text-[var(--text-subtle)]">正确答案：</span>
                      <span className="font-mono text-[var(--success)]">{q.answer}</span>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/practice?bank=${bank}&scope=${q.knowledgePoint}`}
                      className="btn btn-sm"
                    >
                      练习该知识点
                    </Link>
                    <Link
                      href={`/browse?bank=${bank}&i=${q.index - 1}`}
                      className="btn btn-sm btn-ghost"
                    >
                      在题库中定位
                    </Link>
                    {onMastered && !row.ok && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost ml-auto"
                        onClick={() => onMastered(row.key, true)}
                      >
                        我已掌握，移出错题本
                      </button>
                    )}
                  </div>

                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-[var(--text-subtle)]">
                      查看全部选项
                    </summary>
                    <ol className="mt-2 space-y-1 text-xs">
                      {OPTION_LETTERS.map((letter, i) => {
                        const isAns = q.answer.includes(letter);
                        return (
                          <li
                            key={letter}
                            className={`flex gap-2 rounded px-2 py-1 ${
                              isAns ? "bg-[var(--success-soft)]" : ""
                            }`}
                          >
                            <span className="font-mono font-semibold">{letter}</span>
                            <span className="flex-1">{q.options[i]}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
