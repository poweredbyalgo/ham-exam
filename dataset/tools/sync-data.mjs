#!/usr/bin/env node
/**
 * 把 dataset/ 中经过校验的题库数据同步成 Next.js 应用可直接引用的静态数据，
 * 并生成供用户下载的处理后数据包。
 *
 *   dataset/{A,B,C}.json  -> data/questions.json  (按库分组，应用引用)
 *   dataset/figures.json  -> data/figures.json    (附图清单)
 *   dataset/{A,B,C}.json  -> data/index.json      (统计与章节树)
 *   dataset/{A,B,C}.json  -> public/downloads/crac-dataset-{A,B,C}.json (下载用)
 *   dataset/figures.json  -> public/downloads/crac-figures.json
 *   public/figures/*.jpg  -> public/downloads/crac-figures.zip
 *   dataset/pdf/*.pdf     -> public/downloads/crac-bank-{A,B,C}.pdf 与 附图标记 PDF
 *                         （由 /api/download/bank-pdf 按白名单读取并下发）
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
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // dataset/tools
const SRC = path.resolve(HERE, "..");                      // dataset
const ROOT = path.resolve(SRC, "..");                      // 仓库根 = Next.js 应用根
const DATA_OUT = path.join(ROOT, "data");
const FIG_DIR = path.join(ROOT, "public", "figures");
const DL_DIR = path.join(ROOT, "public", "downloads");

/**
 * 题库原始 PDF 白名单：与 lib/downloads.ts 保持一致的 JS 副本。
 *
 * 本脚本是 ESM 且需能在没有 TypeScript 工具链时独立运行，故不直接 import
 * TS 文件；app/api/download/bank-pdf/route.ts 使用 lib/downloads.ts，
 * dataset/tools/verify_dataset.py 会校验两份清单一致，防止漂移。
 */
const BANK_PDFS = [
  { id: "A", file: "A类题库.pdf", label: "A 类题库（原始 PDF）" },
  { id: "B", file: "B类题库.pdf", label: "B 类题库（原始 PDF）" },
  { id: "C", file: "C类题库.pdf", label: "C 类题库（原始 PDF）" },
  { id: "figures", file: "总题库附图标记.pdf", label: "总题库附图标记（原始 PDF）" },
];

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

/** ZIP 条目需要 CRC-32（不引第三方依赖，约 10 行实现）。 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

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

  // ---------- 下载包 ----------
  const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
  const hashFile = async (p) => sha256(await readFile(p));

  await mkdir(DL_DIR, { recursive: true });
  const pdfDir = path.join(SRC, "pdf");

  /**
   * 打包当前 public/figures/ 下的全部图片。
   *
   * 时间戳固定为 1980-01-01（ZIP 纪元下限），条目按文件名排序，
   * 因此同样的输入必然得到逐字节相同的 zip —— 便于校验与去重。
   */
  async function buildFiguresZip() {
    const names = files.slice().sort();
    const chunks = [];
    const central = [];
    let offset = 0;

    const DOS_TIME = 0;      // 00:00:00
    const DOS_DATE = 33;     // 1980-01-01

    for (const name of names) {
      const data = await readFile(path.join(FIG_DIR, name));
      const nameBuf = Buffer.from(name, "utf8");
      const crc = crc32(data);
      const size = data.length;

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);   // 本地文件头签名
      local.writeUInt16LE(20, 4);           // 解压所需版本
      local.writeUInt16LE(0, 6);            // 通用标志
      local.writeUInt16LE(0, 8);            // 压缩方法: 0 = store
      local.writeUInt16LE(DOS_TIME, 10);
      local.writeUInt16LE(DOS_DATE, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(size, 18);        // 压缩后大小
      local.writeUInt32LE(size, 22);        // 原始大小
      local.writeUInt16LE(nameBuf.length, 26);
      local.writeUInt16LE(0, 28);           // 扩展字段长度

      chunks.push(local, nameBuf, data);

      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);      // 中央目录头签名
      cd.writeUInt16LE(20, 4);              // 创建版本
      cd.writeUInt16LE(20, 6);              // 解压所需版本
      cd.writeUInt16LE(0, 8);
      cd.writeUInt16LE(0, 10);
      cd.writeUInt16LE(DOS_TIME, 12);
      cd.writeUInt16LE(DOS_DATE, 14);
      cd.writeUInt32LE(crc, 16);
      cd.writeUInt32LE(size, 20);
      cd.writeUInt32LE(size, 24);
      cd.writeUInt16LE(nameBuf.length, 28);
      cd.writeUInt16LE(0, 30);              // 扩展字段
      cd.writeUInt16LE(0, 32);              // 注释
      cd.writeUInt16LE(0, 34);              // 起始磁盘号
      cd.writeUInt16LE(0, 36);              // 内部属性
      cd.writeUInt32LE(0, 38);              // 外部属性
      cd.writeUInt32LE(offset, 42);         // 本地头偏移量
      central.push(cd, nameBuf);

      offset += local.length + nameBuf.length + data.length;
    }

    const cdBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);      // 中央目录结束记录
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(names.length, 8);
    eocd.writeUInt16LE(names.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);              // 注释长度

    return Buffer.concat([...chunks, cdBuf, eocd]);
  }

  const zipBuf = await buildFiguresZip();
  await writeFile(path.join(DL_DIR, "crac-figures.zip"), zipBuf);

  // ---------- 下载用文件 ----------
  // 两种形态都提供：
  //   crac-dataset-{bank}.json  与 dataset/*.json 完全一致（snake_case，选项为对象，
  //                             含 validation_notes / field_notes 等溯源信息）
  //   crac-questions-{bank}.json 应用内部使用的形态（camelCase，options 为数组），
  //                             便于直接喂给程序做练习/判分
  for (const bank of BANKS) {
    await copyFile(
      path.join(SRC, `${bank}.json`),
      path.join(DL_DIR, `crac-dataset-${bank}.json`),
    );
    await writeFile(
      path.join(DL_DIR, `crac-questions-${bank}.json`),
      JSON.stringify(
        {
          bank,
          name: BANK_NAMES[bank],
          sourceFile: bankSource[bank].source_file,
          total: indexBanks[bank].total,
          dataVersion,
          fieldNotes: {
            index: "在所属题库中的序号（从 1 开始）",
            questionId: "源文件题号，MCn 的 n 表示正确选项个数",
            bankId: "源文件总题库编号；源题库中为空时保留空字符串",
            knowledgePoint: "知识点，格式 章节.小节.条目",
            type: "single = 单选（1 个正确选项），multiple = 多选（2 个及以上）",
            typeCode: "源文件题型前缀 MC1 / MC2 / MC3 / MC4，保留以便溯源",
            stem: "题干",
            options: "长度为 4 的数组，下标 0..3 依次对应选项 A..D",
            answer: "正确答案字母，如 \"A\"、\"AB\"、\"ABCD\"",
            figure: "附图文件名（小写，与 crac-figures.zip 内文件名一致）；无附图为 null",
            issues: "源数据自检标记，正常为空数组",
          },
          questions: questions[bank],
        },
        null,
        1,
      ),
      "utf8",
    );
  }
  await copyFile(
    path.join(SRC, "figures.json"),
    path.join(DL_DIR, "crac-figures.json"),
  );

  const sizeOf = async (p) => (await readFile(p)).length;

  const processedFiles = [];
  for (const bank of BANKS) {
    const name = `crac-questions-${bank}.json`;
    processedFiles.push({
      name,
      label: `${bank} 类题库（处理后 JSON）`,
      desc: `题目、选项、答案、知识点、附图引用；${indexBanks[bank].total} 道题，选项为数组、字段为 camelCase`,
      bytes: await sizeOf(path.join(DL_DIR, name)),
    });
  }
  for (const bank of BANKS) {
    const name = `crac-dataset-${bank}.json`;
    processedFiles.push({
      name,
      label: `${bank} 类题库（原始字段形态）`,
      desc: `与仓库 dataset/${bank}.json 完全一致，含字段说明与校验记录，便于与 PDF 对照`,
      bytes: await sizeOf(path.join(DL_DIR, name)),
    });
  }
  processedFiles.push(
    {
      name: "crac-figures.json",
      label: "附图清单（JSON）",
      desc: `附图编号、文件名、所在页码、尺寸；共 ${figures.length} 条`,
      bytes: await sizeOf(path.join(DL_DIR, "crac-figures.json")),
    },
    {
      name: "crac-figures.zip",
      label: "附图图片包（ZIP）",
      desc: `${files.length} 张 JPG，文件名与题目 figure 字段一致`,
      bytes: zipBuf.length,
    },
  );

  const pdfFiles = [];
  for (const entry of BANK_PDFS) {
    const p = path.join(pdfDir, entry.file);
    if (!existsSync(p)) {
      throw new Error(`缺少题库 PDF: ${p}`);
    }
    pdfFiles.push({
      id: entry.id,
      label: entry.label,
      desc: "未做任何修改的题库原件",
      bytes: await sizeOf(p),
      file: entry.file,
    });
  }

  const downloadManifest = {
    dataVersion,
    generatedAt: new Date().toISOString().slice(0, 10),
    note:
      "处理后的数据由题库 PDF 提取并逐字段校验（dataset/tools/verify_bank.py），" +
      "题目内容未改动；附图文件名统一小写，与题目 figure 字段对应。",
    pdfFiles: pdfFiles.map((f) => ({
      ...f,
      url: `/api/download/bank-pdf?id=${f.id}`,
    })),
    processedFiles: processedFiles.map((f) => ({
      ...f,
      url: `/downloads/${f.name}`,
    })),
  };

  // 校验和：一次读入同时得到 SHA-256
  const hashList = [];
  for (const f of downloadManifest.processedFiles) {
    hashList.push({
      name: f.name,
      bytes: f.bytes,
      sha256: await hashFile(path.join(DL_DIR, f.name)),
    });
  }
  for (const entry of BANK_PDFS) {
    const p = path.join(pdfDir, entry.file);
    hashList.push({
      name: entry.file,
      bytes: await sizeOf(p),
      sha256: await hashFile(p),
    });
  }
  downloadManifest.checksums = hashList;

  await writeJson(path.join(DATA_OUT, "downloads.json"), downloadManifest);

  const bytes = (n) => `${(n / 1024).toFixed(0)} KB`;
  const qSize = Buffer.byteLength(JSON.stringify(questions));
  console.log("题库同步完成");
  console.log(`  题目总数      ${totalQuestions}`);
  console.log(`  唯一题号      ${questionIdCount.size}`);
  console.log(`  附图引用      ${totalFigures}`);
  console.log(`  附图文件      ${files.length} (已在 public/figures/)`);
  console.log(`  数据版本      ${dataVersion}`);
  console.log(`  questions.json ${bytes(qSize)}`);
  console.log(`  下载包        ${processedFiles.length} 个处理后文件 + ${pdfFiles.length} 个原始 PDF`);
  console.log(`  figures.zip   ${bytes(zipBuf.length)}`);
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
