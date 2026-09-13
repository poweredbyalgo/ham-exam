#!/usr/bin/env node
/**
 * 把题库原始 PDF 复制进 public/downloads/，供静态站点直接下载。
 *
 *   dataset/pdf/A类题库.pdf     -> public/downloads/ham-exam-bank-A.pdf
 *   dataset/pdf/B类题库.pdf     -> public/downloads/ham-exam-bank-B.pdf
 *   dataset/pdf/C类题库.pdf     -> public/downloads/ham-exam-bank-C.pdf
 *   dataset/pdf/总题库附图标记.pdf -> public/downloads/ham-exam-bank-figures.pdf
 *
 * 为什么复制而不是留在 dataset/：
 *   纯静态导出（next.config.ts 的 output: "export"）没有服务端，
 *   public/ 下的文件是唯一能被直接请求到的位置。
 *
 * 为什么用 ASCII 文件名：
 *   下载 URL 不依赖服务器的中文路径编码，任何静态托管都能正确命中；
 *   用户在浏览器里看到的文件名由 data/downloads.json 的 file 字段
 *   （中文原名）经 <a download="..."> 指定，与源文件名一致。
 *
 * 本脚本幂等：内容相同时不重复写入，构建可重复执行。
 * 用法：npm run prepare-downloads   （npm run build 会自动先跑）
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // scripts
const ROOT = path.resolve(HERE, "..");
const PDF_SRC = path.join(ROOT, "dataset", "pdf");
const PDF_OUT = path.join(ROOT, "public", "downloads");

/**
 * 与 lib/downloads.ts 的 BANK_PDFS 对应：id -> 源文件 + 对外文件名。
 * 新增题库时三处需同步：lib/downloads.ts、本文件、data/downloads.json。
 */
const MAP = [
  { id: "A", src: "A类题库.pdf", out: "ham-exam-bank-A.pdf" },
  { id: "B", src: "B类题库.pdf", out: "ham-exam-bank-B.pdf" },
  { id: "C", src: "C类题库.pdf", out: "ham-exam-bank-C.pdf" },
  { id: "figures", src: "总题库附图标记.pdf", out: "ham-exam-bank-figures.pdf" },
];

/** dataset/ 缺失时（例如只 clone 了应用代码）不阻断构建，只给出提示。 */
if (!existsSync(PDF_SRC)) {
  console.log(`跳过原始 PDF 复制：未找到 ${PDF_SRC}`);
  console.log("（题库 PDF 属于数据源，缺失时下载页的 PDF 入口会 404，其余功能不受影响）");
  process.exit(0);
}

await mkdir(PDF_OUT, { recursive: true });

let copied = 0;
let skipped = 0;

for (const entry of MAP) {
  const from = path.join(PDF_SRC, entry.src);
  const to = path.join(PDF_OUT, entry.out);

  if (!existsSync(from)) {
    console.warn(`警告：缺少源文件 dataset/pdf/${entry.src}，跳过`);
    continue;
  }

  // 内容一致就跳过，避免每次构建都重写 3.7 MB 文件、打乱 mtime
  if (existsSync(to)) {
    const [a, b] = await Promise.all([readFile(from), readFile(to)]);
    if (a.equals(b)) {
      skipped += 1;
      continue;
    }
  }

  await copyFile(from, to);
  copied += 1;
  console.log(`  ${entry.src} -> public/downloads/${entry.out}`);
}

console.log(
  `原始 PDF 就绪：新复制 ${copied} 个，已是最新 ${skipped} 个（共 ${MAP.length} 个白名单文件）`,
);
