import Link from "next/link";
import { BANK_IDS, bankMeta, dataIndex } from "@/lib/question-bank";
import type { BankId } from "@/lib/types";

/** 题库选择器：跳转到对应题库的练习/统计入口。 */
export function BankPicker({
  hrefFor,
  hideCount = false,
}: {
  hrefFor: (bank: BankId) => string;
  hideCount?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {BANK_IDS.map((bank) => {
        const meta = bankMeta[bank];
        return (
          <Link
            key={bank}
            href={hrefFor(bank)}
            className="card flex flex-col gap-1 p-4 transition-colors hover:border-[var(--accent)]"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold">{bank}</span>
              <span className="text-sm text-[var(--text-muted)]">类题库</span>
              {!hideCount && (
                <span className="ml-auto font-mono text-sm text-[var(--text-subtle)]">
                  {meta.total}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1 pt-1 text-[11px] text-[var(--text-subtle)]">
              <span>单选 {meta.singleChoice}</span>
              <span aria-hidden>·</span>
              <span>多选 {meta.multipleChoice}</span>
              <span aria-hidden>·</span>
              <span>知识点 {meta.knowledgePoints}</span>
              {meta.figures > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>附图 {meta.figures}</span>
                </>
              )}
            </div>
          </Link>
        );
      })}
      <p className="sr-only">
        共 {dataIndex.totals.questions} 道题目，{dataIndex.totals.figureFiles} 张附图
      </p>
    </div>
  );
}
