#!/usr/bin/env node
/**
 * 把 dataset/ 中经过校验的题库数据同步成 Next.js 应用可直接引用的静态数据。
 *
 *   dataset/{A,B,C}.json  -> data/questions.json  (按库分组)
 *   dataset/figures.json  -> data/figures.json    (附图清单)
 *   dataset/{A,B,C}.json  -> data/index.json      (统计与章节树)
 *
 * 附图文件由上游 dataset/tools/build_dataset.py 直接写入 public/figures/，
 * 本脚本只校验「题目引用 -> 文件存在」，不再复制图片，避免出现两份副本。
 *
 * 数据来源与校验见 dataset/tools/verify_bank.py；本脚本只做字段重塑与
 * 规范化，不改动题目内容。重复执行是幂等的。
 *
 * 用法：node dataset/tools/sync-data.mjs   （或根目录 npm run sync-data）
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // dataset/tools
const SRC = path.resolve(HERE, "..");                      // dataset
const ROOT = path.resolve(SRC, "..");                      // 仓库根 = Next.js 应用根
const DATA_OUT = path.join(ROOT, "data");
const FIG_DIR = path.join(ROOT, "public", "figures");

const BANKS = ["A", "B", "C"];
const BANK_NAMES = {
  A: "A 类操作技术能力验证",
  B: "B 类操作技术能力验证",
  C: "C 类操作技术能力验证",
};

/** 结果页与统计面板使用的章节名称对照（源题库知识点编号 -> 中文名）。 */
const CHAPTER_NAMES = {
  "1": "法律法规与管理制度",
  "2": "操作规范与通联流程",
  "3": "电波传播与天线",
  "4": "电子电路与设备",
  "5": "安全防护与电磁环境",
};

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

/** 附图字段规范化：题库中写作 "LK0597.JPG"，本地文件为 "lk0597.jpg"。 */
const normalizeFigure = (raw) => {
  if (!raw) return null;
  const id = String(raw).split(".")[0].trim().toUpperCase();
  return /^LK\d{3,4}$/.test(id) ? `${id}.jpg` : null;
};

async function main() {
  if (!existsSync(SRC)) {
    throw new Error(`未找到题库数据目录: ${SRC}`);
  }

  const bankSource = {};
  for (const bank of BANKS) {
    const file = path.join(SRC, `${bank}.json`);
    if (!existsSync(file)) throw new Error(`缺少题库文件: ${file}`);
    bankSource[bank] = await readJson(file);
  }

  // ---------- 题目 ----------
  const questionIdCount = new Map(); // 用于检测跨库重复题号
  const questions = {};
  const indexBanks = {};
  let totalQuestions = 0;
  let totalFigures = 0;

  for (const bank of BANKS) {
    const src = bankSource[bank];
    const out = [];
    const byType = { single: 0, multiple: 0, other: 0 };
    const byChapter = new Map();
    const kpSet = new Set();
    let figureRefs = 0;

    for (const q of src.questions) {
      const answer = String(q.answer ?? "").toUpperCase().replace(/\s+/g, "");
      // 题型以答案个数为准（生成阶段已按此规则判定并在 validation_notes 记录差异）
      const type = answer.length > 1 ? "multiple" : answer.length === 1 ? "single" : "other";
      const chapter = String(q.knowledge_point ?? "").split(".")[0] || "0";
      const figure = normalizeFigure(q.figure);

      out.push({
        index: q.index,
        questionId: q.question_id,
        bankId: q.bank_id,
        knowledgePoint: q.knowledge_point,
        type,
        typeCode: q.type_code,
        stem: q.stem,
        options: [q.options.A, q.options.B, q.options.C, q.options.D],
        answer,
        figure,
        issues: Array.isArray(q.issues) ? q.issues : [],
      });

      byType[type] += 1;
      byChapter.set(chapter, (byChapter.get(chapter) ?? 0) + 1);
      kpSet.add(q.knowledge_point);
      if (figure) figureRefs += 1;
      questionIdCount.set(q.question_id, (questionIdCount.get(q.question_id) ?? 0) + 1);
    }

    questions[bank] = out;
    totalQuestions += out.length;
    totalFigures += figureRefs;

    indexBanks[bank] = {
      id: bank,
      name: BANK_NAMES[bank],
      sourceFile: src.source_file,
      total: out.length,
      figures: figureRefs,
      multipleChoice: byType.multiple,
      singleChoice: byType.single,
      knowledgePoints: kpSet.size,
      chapters: [...byChapter.entries()]
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([chapter, count]) => ({
          chapter,
          name: CHAPTER_NAMES[chapter] ?? `第 ${chapter} 章`,
          count,
        })),
    };
  }

  // ---------- 附图 ----------
  const figSrc = await readJson(path.join(SRC, "figures.json"));
  const figures = figSrc.map((f) => ({
    id: f.figure_id,
    file: f.file,
    page: f.page,
    width: f.width,
    height: f.height,
  }));

  const referenced = new Set();
  for (const bank of BANKS) {
    for (const q of questions[bank]) if (q.figure) referenced.add(q.figure);
  }
  // 大小写不敏感比较：题目里保留源文件的 "LK0597.JPG"，磁盘上是 "lk0597.jpg"
  const manifestFiles = new Set(figures.map((x) => x.file.toLowerCase()));
  const missing = [...referenced].filter(
    (f) => !manifestFiles.has(f.toLowerCase()),
  );
  if (missing.length) {
    throw new Error(`题目引用了不存在的附图: ${missing.join(", ")}`);
  }

  // ---------- 哈希（用于前端提示数据版本） ----------
  const hash = createHash("sha256");
  for (const bank of BANKS) hash.update(JSON.stringify(questions[bank]));
  const dataVersion = hash.digest("hex").slice(0, 12);

  const index = {
    dataVersion,
    generatedFrom: "dataset/{A,B,C}.json + dataset/figures.json",
    note: "字段重塑自已验证的题库数据（见 dataset/tools/verify_bank.py），题目内容未改动。",
    totals: {
      questions: totalQuestions,
      uniqueQuestionIds: questionIdCount.size,
      figureReferences: totalFigures,
      figureFiles: figures.length,
      sharedAcrossBanks: [...questionIdCount.values()].filter((n) => n > 1).length,
    },
    banks: indexBanks,
  };

  const writeJson = async (p, value) => {
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(value), "utf8");
  };
  await writeJson(path.join(DATA_OUT, "questions.json"), questions);
  await writeJson(path.join(DATA_OUT, "figures.json"), figures);
  await writeJson(path.join(DATA_OUT, "index.json"), index);

  // ---------- 附图文件由上游 build_dataset.py 写入 public/figures/，这里只做核对 ----------
  if (!existsSync(FIG_DIR)) {
    throw new Error(
      `未找到附图目录 ${FIG_DIR}，请先运行: python dataset/tools/build_dataset.py`,
    );
  }
  const files = (await readdir(FIG_DIR)).filter((f) => /\.(jpe?g|png)$/i.test(f));
  const onDisk = new Set(files.map((f) => f.toLowerCase()));
  const referencedFiles = new Set(
    BANKS.flatMap((b) => questions[b].map((q) => q.figure).filter(Boolean)),
  );
  const absent = [...referencedFiles].filter((f) => !onDisk.has(f.toLowerCase()));
  if (absent.length) {
    throw new Error(`public/figures/ 缺少题目引用的图片: ${absent.join(", ")}`);
  }

  const bytes = (n) => `${(n / 1024).toFixed(0)} KB`;
  const qSize = Buffer.byteLength(JSON.stringify(questions));
  console.log("题库同步完成");
  console.log(`  题目总数      ${totalQuestions}`);
  console.log(`  唯一题号      ${questionIdCount.size}`);
  console.log(`  附图引用      ${totalFigures}`);
  console.log(`  附图文件      ${files.length} (已在 public/figures/)`);
  console.log(`  数据版本      ${dataVersion}`);
  console.log(`  questions.json ${bytes(qSize)}`);
  for (const bank of BANKS) {
    const b = indexBanks[bank];
    console.log(
      `  [${bank}] ${String(b.total).padStart(4)} 题  单选 ${b.singleChoice}  多选 ${b.multipleChoice}  知识点 ${b.knowledgePoints}  附图 ${b.figures}`,
    );
  }
}

main().catch((err) => {
  console.error("题库同步失败:", err.message);
  process.exit(1);
});
