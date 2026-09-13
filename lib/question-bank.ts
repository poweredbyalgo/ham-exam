/**
 * 题库访问层。
 *
 * 题目数据在构建时由 scripts/sync-data.mjs 从 ../dataset 生成，
 * 通过静态 JSON 导入进 bundle —— 全站数据同源、可离线、无需后端。
 */
import questionsData from "@/data/questions.json";
import figuresData from "@/data/figures.json";
import indexData from "@/data/index.json";
import type {
  BankId,
  ChapterMeta,
  DataIndex,
  FigureMeta,
  Question,
} from "./types";

export const BANK_IDS: BankId[] = ["A", "B", "C"];

/**
 * 生成的 JSON 是字面量类型（options 推断为 string[]），
 * 而 Question.options 是固定 4 元组，这里统一做一次断言收口。
 * 生成脚本保证每题恰好 4 个选项（见 tools/verify_bank.py 的选项完整性检查）。
 */
const RAW = questionsData as unknown as Record<string, Question[]>;

export const BANK_NAMES: Record<BankId, string> = {
  A: "A 类",
  B: "B 类",
  C: "C 类",
};

export const dataIndex = indexData as DataIndex;
export const figures = figuresData as FigureMeta[];
export const bankMeta = dataIndex.banks;

/** 全部题目，按库分组 */
export const questionsByBank: Record<BankId, Question[]> = {
  A: RAW.A ?? [],
  B: RAW.B ?? [],
  C: RAW.C ?? [],
};

export function isBankId(value: string | undefined | null): value is BankId {
  return value === "A" || value === "B" || value === "C";
}

/** 题目唯一定位键。A/B/C 之间存在大量共用题号，故键必须含库标识。 */
export function questionKey(bank: BankId, question: Question): string {
  return `${bank}:${question.index}`;
}

const byKey = new Map<string, { bank: BankId; question: Question }>();
for (const bank of BANK_IDS) {
  for (const q of questionsByBank[bank]) {
    byKey.set(questionKey(bank, q), { bank, question: q });
  }
}

export function getQuestion(key: string): { bank: BankId; question: Question } | null {
  return byKey.get(key) ?? null;
}

export function getQuestions(bank: BankId): Question[] {
  return questionsByBank[bank] ?? [];
}

/** 题号索引：`${bank}:${questionId}` -> 题目 */
const byQuestionId = new Map<string, Question>();
for (const bank of BANK_IDS) {
  for (const q of questionsByBank[bank]) {
    byQuestionId.set(`${bank}:${q.questionId}`, q);
  }
}
export function findQuestion(bank: BankId, questionId: string): Question | null {
  return byQuestionId.get(`${bank}:${questionId}`) ?? null;
}

/** 知识点列表（含题量），按知识点编号自然排序 */
export function knowledgePoints(
  bank: BankId,
): { knowledgePoint: string; count: number }[] {
  const counter = new Map<string, number>();
  for (const q of getQuestions(bank)) {
    counter.set(q.knowledgePoint, (counter.get(q.knowledgePoint) ?? 0) + 1);
  }
  return [...counter.entries()]
    .map(([knowledgePoint, count]) => ({ knowledgePoint, count }))
    .sort((a, b) => compareKnowledgePoint(a.knowledgePoint, b.knowledgePoint));
}

/** 按 "1.2.3" 形式的数字段逐级比较，避免 "1.10" 排在 "1.9" 之前。 */
export function compareKnowledgePoint(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? -1;
    const y = pb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

export function chapters(bank: BankId): ChapterMeta[] {
  return bankMeta[bank]?.chapters ?? [];
}

export function chapterOf(knowledgePoint: string): string {
  return knowledgePoint.split(".")[0] || "0";
}

export function chapterName(bank: BankId, chapter: string): string {
  return (
    chapters(bank).find((c) => c.chapter === chapter)?.name ?? `第 ${chapter} 章`
  );
}

/** 按知识点筛选（scope 为章节号时匹配该章全部题目） */
export function filterByScope(bank: BankId, scope: string | null): Question[] {
  const all = getQuestions(bank);
  if (!scope || scope === "all") return all;
  if (scope.includes(".")) {
    return all.filter((q) => q.knowledgePoint === scope);
  }
  return all.filter((q) => chapterOf(q.knowledgePoint) === scope);
}

/** 附图 URL（文件已归一化为小写 .jpg 并复制到 public/figures） */
export function figureUrl(file: string): string {
  return `/figures/${file.toLowerCase()}`;
}

/**
 * 可复现的伪随机数发生器（mulberry32）。
 * 用于模拟考试组卷：同一 seed 得到同一套题，便于分享与复盘。
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 用给定随机源做 Fisher–Yates 洗牌（返回新数组） */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 打乱选项顺序，返回新的选项数组与正确答案的新字母。 */
export function shuffleOptions(
  question: Question,
  rand: () => number,
): { options: [string, string, string, string]; answer: string } {
  const order = shuffle([0, 1, 2, 3], rand);
  const options = order.map((i) => question.options[i]) as [
    string,
    string,
    string,
    string,
  ];
  const answer = question.answer
    .split("")
    .map((letter) => {
      const original = letter.charCodeAt(0) - 65;
      const moved = order.indexOf(original);
      return String.fromCharCode(65 + Math.max(0, moved));
    })
    .sort()
    .join("");
  return { options, answer };
}

/** 判定作答是否正确（多选需完全一致，与源题库答案规则一致） */
export function isCorrect(selected: string[], answer: string): boolean {
  const norm = (s: string[]) => [...new Set(s)].sort().join("");
  return norm(selected) === norm(answer.split(""));
}

export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

/** 仅用于界面展示的题型标签 */
export function typeLabel(question: Question): string {
  if (question.type === "single") return "单选题";
  if (question.type === "multiple") return "多选题";
  return "待定题型";
}
