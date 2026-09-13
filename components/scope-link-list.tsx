import Link from "next/link";
import { BANK_IDS, BANK_NAMES, chapters, knowledgePoints } from "@/lib/question-bank";
import type { BankId } from "@/lib/types";

/**
 * 服务端渲染的章节/知识点导航列表（浏览页侧栏）。
 * 用 <details> 展开知识点，无需客户端 JS。
 */
export function ScopeLinkList({
  bank,
  scope,
  mode,
}: {
  bank: BankId;
  scope: string;
  mode: "browse" | "practice";
}) {
  const chs = chapters(bank);
  const kps = knowledgePoints(bank);
  const base = mode === "browse" ? "/browse" : "/practice";

  const href = (next: string) => {
    const qs = new URLSearchParams({ bank, scope: next });
    return `${base}?${qs.toString()}`;
  };

  const itemClass = (active: boolean) =>
    `flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
      active
        ? "bg-[var(--accent-soft)] text-[var(--accent-text)] font-medium"
        : "hover:bg-[var(--surface-2)]"
    }`;

  return (
    <nav aria-label="章节导航">
      <div className="mb-2 flex gap-1">
        {BANK_IDS.map((b) => (
          <Link
            key={b}
            href={`${base}?bank=${b}`}
            className={`btn btn-sm flex-1 ${b === bank ? "btn-primary" : "btn-ghost"}`}
          >
            {BANK_NAMES[b]}
          </Link>
        ))}
      </div>

      <Link href={href("all")} className={itemClass(scope === "all")}>
        <span>全部题目</span>
      </Link>

      <ul className="mt-1 space-y-0.5">
        {chs.map((c) => {
          const inChapter = kps.filter((k) =>
            k.knowledgePoint.startsWith(`${c.chapter}.`),
          );
          return (
            <li key={c.chapter}>
              <Link href={href(c.chapter)} className={itemClass(scope === c.chapter)}>
                <span className="truncate">
                  <span className="mr-1 font-mono text-xs text-[var(--text-subtle)]">
                    {c.chapter}
                  </span>
                  {c.name}
                </span>
                <span className="font-mono text-[11px] text-[var(--text-subtle)]">
                  {c.count}
                </span>
              </Link>
              <details>
                <summary className="cursor-pointer list-none rounded px-2 py-0.5 text-[11px] text-[var(--text-subtle)] hover:bg-[var(--surface-2)]">
                  {inChapter.length} 个知识点
                </summary>
                <ul className="ml-2 border-l border-[var(--border)] pl-1">
                  {inChapter.map((k) => (
                    <li key={k.knowledgePoint}>
                      <Link
                        href={href(k.knowledgePoint)}
                        className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                          scope === k.knowledgePoint
                            ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                            : "hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <span className="font-mono">{k.knowledgePoint}</span>
                        <span className="text-[var(--text-subtle)]">{k.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
