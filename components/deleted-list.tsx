"use client";

import Link from "next/link";
import { useState } from "react";
import { figureUrl } from "@/lib/question-bank";
import type { BankId, Question } from "@/lib/types";

export interface DeletedRowData {
  key: string;
  bank: BankId;
  question: Question;
}

/**
 * 已删除题目列表：练习页删除的题集中在这里，支持逐个恢复、
 * 勾选批量恢复与一键全部恢复。恢复后题目重新出现在各做题入口。
 */
export function DeletedList({
  rows,
  onRestore,
  onRestoreAll,
  emptyHint,
}: {
  rows: DeletedRowData[];
  onRestore: (keys: string[]) => void;
  onRestoreAll: () => void;
  emptyHint?: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setChecked((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.key)),
    );
  };

  if (rows.length === 0) {
    return (
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        {emptyHint ?? "没有已删除的题目。"}
      </p>
    );
  }

  const allChecked = checked.size === rows.length;

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            aria-label="全选"
          />
          全选（{rows.length} 题）
        </label>
        <button
          type="button"
          className="btn btn-sm btn-primary ml-auto"
          disabled={checked.size === 0}
          onClick={() => {
            onRestore([...checked]);
            setChecked(new Set());
          }}
        >
          恢复所选（{checked.size}）
        </button>
        <button type="button" className="btn btn-sm" onClick={onRestoreAll}>
          全部恢复
        </button>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const q = row.question;
          return (
            <li
              key={row.key}
              className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <input
                type="checkbox"
                className="mt-1 flex-none"
                checked={checked.has(row.key)}
                onChange={() => toggle(row.key)}
                aria-label={`选择 ${q.questionId}`}
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm leading-relaxed">{q.stem}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-subtle)]">
                  <span className="font-mono">{q.questionId}</span>
                  <span>知识点 {q.knowledgePoint}</span>
                  {q.type === "multiple" && <span className="chip chip-warn">多选</span>}
                  {q.figure && (
                    <a
                      href={figureUrl(q.figure)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent-text)] hover:underline"
                    >
                      含附图
                    </a>
                  )}
                </p>
              </div>
              <div className="flex flex-none flex-col items-end gap-1">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => onRestore([row.key])}
                >
                  恢复
                </button>
                <Link
                  href={`/browse?bank=${row.bank}&i=${q.index - 1}`}
                  className="text-[11px] text-[var(--text-subtle)] hover:underline"
                >
                  查看原题
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
