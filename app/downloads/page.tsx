import Link from "next/link";
import downloadsData from "@/data/downloads.json";
import { dataIndex } from "@/lib/question-bank";

export const metadata = {
  title: "数据下载",
  description:
    "下载题库原始 PDF、处理后的题目 JSON 数据与附图图片包，含 SHA-256 校验值。",
};

interface DownloadItem {
  name?: string;
  id?: string;
  label: string;
  desc: string;
  bytes: number;
  url: string;
}

interface Checksum {
  name: string;
  bytes: number;
  sha256: string;
}

interface DownloadsManifest {
  dataVersion: string;
  generatedAt: string;
  note: string;
  pdfFiles: DownloadItem[];
  processedFiles: DownloadItem[];
  checksums: Checksum[];
}

const manifest = downloadsData as DownloadsManifest;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function DownloadRow({ item, icon }: { item: DownloadItem; icon: string }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] py-3 last:border-0">
      <span aria-hidden className="text-lg leading-none">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{item.label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-muted)]">
          {item.desc}
          <span className="ml-2 font-mono text-[var(--text-subtle)]">
            {formatSize(item.bytes)}
          </span>
        </span>
      </span>
      <a
        href={item.url}
        download
        className="btn btn-sm btn-primary flex-none"
        aria-label={`下载 ${item.label}`}
      >
        <DownloadIcon />
        下载
      </a>
    </li>
  );
}

const t = dataIndex.totals;

export default function DownloadsPage() {
  return (
    <div className="space-y-4">
      <header className="card p-5">
        <h1 className="text-lg font-semibold">数据下载</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
          题库数据可自由下载用于学习与二次开发。原始 PDF 是未做任何修改的题库原件；
          处理后的数据由 PDF 提取并经逐字段校验，题目内容与原件一致，只是整理成了
          便于程序读取的 JSON 结构。
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <Row label="题目总数" value={`${t.questions} 道`} />
          <Row label="唯一题号" value={`${t.uniqueQuestionIds} 个`} />
          <Row label="附图" value={`${t.figureFiles} 张`} />
          <Row label="数据版本" value={manifest.dataVersion} mono />
        </dl>
      </header>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">题库原始 PDF</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-subtle)]">
          {manifest.pdfFiles.length} 个文件，未做任何修改。题目内容的版权归原作者 / 发布机构所有，
          请仅用于个人学习。
        </p>
        <ul className="mt-2">
          {manifest.pdfFiles.map((f) => (
            <DownloadRow key={f.id ?? f.label} item={f} icon="📕" />
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">处理后的题库数据与图片</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-subtle)]">
          {manifest.note}
        </p>
        <ul className="mt-2">
          {manifest.processedFiles.map((f) => (
            <DownloadRow key={f.name ?? f.label} item={f} icon="🗂️" />
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">数据格式说明</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-subtle)]">
          每个题库提供两种形态，内容相同、只是字段组织方式不同：
          <code className="mx-1 font-mono">ham-exam-questions-*.json</code>
          字段为 camelCase、选项为数组，拿来即可判分；
          <code className="mx-1 font-mono">ham-exam-dataset-*.json</code>
          与仓库中经校验的原始数据完全一致（snake_case、选项为对象），便于与 PDF 对照。
        </p>

        <h3 className="mt-4 text-xs font-medium text-[var(--text-muted)]">
          ham-exam-questions-*.json（推荐使用）
        </h3>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--surface-2)] p-3 text-xs leading-relaxed">
{`{
  "bank": "A", "name": "A 类操作技术能力验证",
  "total": 683, "dataVersion": "a052a0c01311",
  "fieldNotes": { ... },            // 各字段含义说明
  "questions": [
    {
      "index": 14,                  // 在所属题库中的序号（1 起）
      "questionId": "MC1-0014",     // 源文件题号，MCn 的 n = 正确选项个数
      "bankId": "LX",               // 源文件总题库编号（可能为占位值 "LX"）
      "knowledgePoint": "1.1.2",    // 知识点：章节.小节.条目
      "type": "multiple",           // single 单选 / multiple 多选
      "typeCode": "MC1",            // 源文件题型前缀，保留以便溯源
      "stem": "关于业余业务、卫星业余业务，下列说法正确的是：",
      "options": ["……", "……", "……", "……"],  // 固定 4 项，下标 0..3 = A..D
      "answer": "AB",               // 正确答案字母
      "figure": null,               // 附图文件名如 "lk0597.jpg"；无附图为 null
      "issues": []                  // 源数据自检标记（见下）
    }
  ]
}`}
        </pre>

        <h3 className="mt-4 text-xs font-medium text-[var(--text-muted)]">
          ham-exam-dataset-*.json（与仓库校验数据一致）
        </h3>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--surface-2)] p-3 text-xs leading-relaxed">
{`{
  "source_file": "A类题库.pdf",
  "category": "A",
  "total": 683,
  "type_counts": { "single_choice": 547, "multiple_choice": 136 },
  "chapter_counts": { "1": 225, "2": 166, ... },
  "footer_page_numbers_stripped": 0,   // 生成时剔除的页脚页码数（C 类为 309）
  "validation_notes": [ ... ],         // 生成阶段发现并记录的源数据异常
  "field_notes": { ... },              // 各字段中文说明
  "questions": [
    {
      "index": 14,
      "question_id": "MC1-0014",
      "bank_id": "LX",
      "knowledge_point": "1.1.2",
      "type": "multiple_choice",
      "type_code": "MC1",
      "stem": "……",
      "options": { "A": "……", "B": "……", "C": "……", "D": "……" },
      "answer": "AB",
      "answer_options": ["A", "B"],
      "figure": null,
      "issues": []
    }
  ]
}`}
        </pre>

        <ul className="mt-3 space-y-1 text-xs leading-relaxed text-[var(--text-muted)]">
          <li>
            · 三套题库之间存在大量共用题号，跨库使用时请以{" "}
            <code className="font-mono">questionId</code> 为准去重，或按{" "}
            <code className="font-mono">bank + index</code> 定位。
          </li>
          <li>
            · 多选题需<strong>选全</strong>所有正确选项才算答对（与源题库规则一致）。
          </li>
          <li>
            · 附图文件名与 <code className="font-mono">figure</code>{" "}
            字段一一对应（已统一小写，zip 内文件名同此）。
          </li>
          <li>
            · 源题库中 <code className="font-mono">MC1-0014</code> 与{" "}
            <code className="font-mono">MC1-0016</code> 前缀为 MC1（单选）但答案有两项。
            数据以<strong>答案个数</strong>判定为多选，<code className="font-mono">issues</code>{" "}
            中会标记 <code className="font-mono">type_code_vs_answer_count_mismatch</code>，
            共 6 条记录（三套题库各 2 条）。
          </li>
        </ul>
      </section>

      <section className="card p-4">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            校验值（SHA-256）
            <span className="ml-2 text-xs font-normal text-[var(--text-subtle)]">
              共 {manifest.checksums.length} 个文件，可用于确认下载完整
            </span>
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-subtle)]">
                  <th className="py-2 font-medium">文件</th>
                  <th className="py-2 text-right font-medium">大小</th>
                  <th className="py-2 font-medium">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {manifest.checksums.map((c) => (
                  <tr key={c.name} className="border-b border-[var(--border)]/60">
                    <td className="py-2 pr-3 font-mono">{c.name}</td>
                    <td className="py-2 pr-3 text-right font-mono text-[var(--text-subtle)]">
                      {formatSize(c.bytes)}
                    </td>
                    <td className="break-all py-2 font-mono text-[var(--text-subtle)]">
                      {c.sha256}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-subtle)]">
            校验示例（PowerShell）：
            <code className="ml-1 font-mono">
              Get-FileHash ham-exam-dataset-A.json -Algorithm SHA256
            </code>
          </p>
        </details>
      </section>

      <p className="px-1 text-xs leading-relaxed text-[var(--text-subtle)]">
        数据由本仓库的 <code className="font-mono">dataset/tools/</code> 管线从题库 PDF
        生成，可复现：先 <code className="font-mono">npm run dataset:build</code> 重建数据，
        再 <code className="font-mono">npm run dataset:verify</code> 校验与 PDF 一致。
        生成时间 {manifest.generatedAt}。返回{" "}
        <Link href="/" className="text-[var(--accent-text)] underline">
          首页
        </Link>
        。
      </p>
    </div>
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
    <div className="flex items-baseline gap-2">
      <dt className="flex-none text-[var(--text-subtle)]">{label}</dt>
      <dd className={mono ? "font-mono" : ""}>{value}</dd>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}
