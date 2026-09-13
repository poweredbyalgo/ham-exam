import Link from "next/link";
import { BankPicker } from "@/components/bank-picker";
import { HomeOverview } from "@/components/home-overview";
import { dataIndex } from "@/lib/question-bank";

export default function HomePage() {
  const t = dataIndex.totals;

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-gradient-to-br from-[var(--accent-soft)] to-transparent p-5 sm:p-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            业余无线电操作技术能力验证练习
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
            面向 A / B / C 类操作技术能力验证的刷题系统。共{" "}
            <strong className="text-[var(--text)]">{t.questions}</strong> 道题目（
            {t.uniqueQuestionIds} 个唯一题号）、
            <strong className="text-[var(--text)]">{t.figureFiles}</strong> 张电路与天线附图。
            进度全部保存在本机浏览器，无需注册，断网也能练习。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/practice" className="btn btn-primary">
              开始练习
            </Link>
            <Link href="/exam" className="btn">
              模拟考试
            </Link>
            <Link href="/review" className="btn btn-ghost">
              错题本
            </Link>
          </div>
        </div>
        <HomeOverview />
      </section>

      <section>
        <h2 className="mb-3 px-1 text-sm font-semibold text-[var(--text-muted)]">
          选择题库
        </h2>
        <BankPicker hrefFor={(bank) => `/practice?bank=${bank}`} />
      </section>

      <section>
        <h2 className="mb-3 px-1 text-sm font-semibold text-[var(--text-muted)]">
          功能入口
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            href="/practice"
            title="顺序练习"
            desc="按题库原始顺序或指定章节逐题练习，自动记录断点，下次接着做。"
            icon="📖"
          />
          <ModeCard
            href="/exam"
            title="模拟考试"
            desc="按真实考试规则随机组卷并限时作答，交卷后给出得分与错题分布。"
            icon="⏱️"
          />
          <ModeCard
            href="/practice?mode=memorize"
            title="背题模式"
            desc="题目与正确答案同时展示，适合考前快速过一遍题面与答案。"
            icon="💡"
          />
          <ModeCard
            href="/review"
            title="错题本 / 收藏夹"
            desc="自动收录做错的题，支持重做、标记掌握与手动收藏重点题。"
            icon="⭐"
          />
          <ModeCard
            href="/stats"
            title="掌握度统计"
            desc="按知识点统计正确率，找出薄弱环节，量化复习进度。"
            icon="📊"
          />
          <ModeCard
            href="/browse"
            title="题库浏览"
            desc="按章节浏览全部题目与答案，支持跳转题号与附图查看。"
            icon="🔍"
          />
          <ModeCard
            href="/downloads"
            title="数据下载"
            desc="下载题库原始 PDF、处理后的题目 JSON 与附图图片包，附 SHA-256 校验值。"
            icon="⬇️"
          />
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">关于题库数据</h2>
          <Link href="/downloads" className="btn btn-sm btn-ghost ml-auto">
            下载数据
          </Link>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="数据来源" value={dataIndex.generatedFrom} mono />
          <Row label="数据版本" value={dataIndex.dataVersion} mono />
          <Row label="附图引用" value={`${t.figureReferences} 处，对应 ${t.figureFiles} 张图片`} />
          <Row label="跨库共用题号" value={`${t.sharedAcrossBanks} 个`} />
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-subtle)]">
          {dataIndex.note}
          题库中 {t.sharedAcrossBanks} 个题号同时出现在多套题库中（三套题库本身存在大量重叠），
          因此练习进度按「题库 + 题号」分别记录，各库计数互不干扰。
          原始 PDF 与处理后的 JSON、附图图片包可在
          <Link href="/downloads" className="mx-1 text-[var(--accent-text)] underline">
            数据下载
          </Link>
          页获取。
        </p>
      </section>
    </div>
  );
}

function ModeCard({
  href,
  title,
  desc,
  icon,
}: {
  href: string;
  title: string;
  desc: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="card flex gap-3 p-4 transition-colors hover:border-[var(--accent)]"
    >
      <span aria-hidden className="text-xl leading-none">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">
          {desc}
        </span>
      </span>
      <span aria-hidden className="self-center text-[var(--text-subtle)]">
        →
      </span>
    </Link>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <dt className="flex-none text-[var(--text-subtle)]">{label}</dt>
      <dd className={`break-all text-[var(--text-muted)] ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
