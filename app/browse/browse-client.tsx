"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { OPTION_LETTERS, filterByScope, isBankId } from "@/lib/question-bank";
import { ScopeLinkList } from "@/components/scope-link-list";

/**
 * 题库浏览。
 *
 * 查询参数（bank / scope / page / i）在客户端读取，而不是服务端组件里
 * `await searchParams` —— 纯静态导出（output: "export"）没有服务端，
 * 构建期无法得知这些取值，服务端读取会直接构建失败。
 *
 * 代价：本页只预渲染「A 类 · 全部 · 第 1 页」这一份外壳 HTML，
 * 带参数的筛选/翻页在浏览器里 hydrate 后才完成；因此本页内容
 * 不能用 scripts/smoke.mjs 的 SSR 断言来覆盖，改由 scripts/e2e.mjs 覆盖。
 */

const PAGE_SIZE = 25;

export function BrowseClient() {
  const params = useSearchParams();

  const bankParam = params.get("bank") ?? undefined;
  const bank = isBankId(bankParam) ? bankParam : "A";
  const scope = params.get("scope") ?? "all";
  const pageParam = Number(params.get("page") ?? "1");
  const focusIndex = Number(params.get("i") ?? NaN);

  const pool = filterByScope(bank, scope);
  const totalPages = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.isFinite(pageParam) ? pageParam : 1), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const slice = pool.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-4">
      <header className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">题库浏览</h1>
          <span className="chip">
            {pool.length} 题 · 第 {page}/{totalPages} 页
          </span>
          <Link
            href={`/practice?bank=${bank}&scope=${scope}`}
            className="btn btn-sm btn-primary ml-auto"
          >
            练习这一范围
          </Link>
        </div>
        <p className="mt-2 text-xs text-[var(--text-subtle)]">
          本页直接展示题干、全部选项与正确答案，适合快速核对。练习与判分请使用
          <Link href={`/practice?bank=${bank}&scope=${scope}`} className="mx-1 text-[var(--accent-text)] underline">
            练习模式
          </Link>
          。
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="card h-fit p-3 lg:sticky lg:top-20">
          <ScopeLinkList bank={bank} scope={scope} mode="browse" />
        </aside>

        <div className="space-y-3">
          {slice.map((q, i) => {
            const absolute = start + i;
            const focused = Number.isFinite(focusIndex) && absolute === focusIndex;
            return (
              <article
                key={q.index}
                id={`q-${q.index}`}
                className={`card p-4 ${focused ? "ring-2 ring-[var(--accent)]" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-mono text-[var(--text-subtle)]">
                    #{absolute + 1} · 第 {q.index} 题
                  </span>
                  <span className={q.type === "multiple" ? "chip chip-warn" : "chip"}>
                    {q.type === "multiple" ? "多选" : "单选"}
                  </span>
                  <span className="chip">知识点 {q.knowledgePoint}</span>
                  <span className="chip font-mono">{q.bankId || "编号缺失"}</span>
                  <span className="chip font-mono">{q.questionId}</span>
                  <span className="chip chip-success font-mono">答案 {q.answer}</span>
                </div>

                <h2 className="mt-2 text-[0.9375rem] font-medium leading-relaxed">
                  {q.stem}
                </h2>

                {q.figure && (
                  <figure className="mt-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/figures/${q.figure.toLowerCase()}`}
                      alt={`附图 ${q.figure}`}
                      loading="lazy"
                      className="mx-auto max-h-56 w-auto rounded-lg border border-[var(--border)] bg-white p-1.5"
                    />
                    <figcaption className="mt-1 text-center text-[11px] text-[var(--text-subtle)]">
                      附图 {q.figure.replace(/\.jpg$/i, "")}
                    </figcaption>
                  </figure>
                )}

                <ol className="mt-2 space-y-1 text-sm">
                  {OPTION_LETTERS.map((letter, oi) => {
                    const isAnswer = q.answer.includes(letter);
                    return (
                      <li
                        key={letter}
                        className={`flex gap-2 rounded-md px-2 py-1 ${
                          isAnswer ? "bg-[var(--success-soft)]" : ""
                        }`}
                      >
                        <span className="font-mono font-semibold">{letter}</span>
                        <span className="flex-1">{q.options[oi]}</span>
                        {isAnswer && (
                          <span className="flex-none self-center text-[11px] text-[var(--success)]">
                            ✓
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </article>
            );
          })}
        </div>
      </div>

      <nav
        className="flex items-center justify-center gap-2"
        aria-label="分页导航"
      >
        <PageLink bank={bank} scope={scope} page={1} disabled={page === 1} label="首页" />
        <PageLink
          bank={bank}
          scope={scope}
          page={page - 1}
          disabled={page === 1}
          label="上一页"
        />
        <span className="px-2 font-mono text-sm">
          {page} / {totalPages}
        </span>
        <PageLink
          bank={bank}
          scope={scope}
          page={page + 1}
          disabled={page === totalPages}
          label="下一页"
        />
        <PageLink
          bank={bank}
          scope={scope}
          page={totalPages}
          disabled={page === totalPages}
          label="末页"
        />
      </nav>
    </div>
  );
}

function PageLink({
  bank,
  scope,
  page,
  disabled,
  label,
}: {
  bank: string;
  scope: string;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="btn btn-sm" aria-disabled="true" style={{ opacity: 0.45 }}>
        {label}
      </span>
    );
  }
  const qs = new URLSearchParams({ bank, page: String(page) });
  if (scope !== "all") qs.set("scope", scope);
  return (
    <Link href={`/browse?${qs.toString()}`} className="btn btn-sm">
      {label}
    </Link>
  );
}
