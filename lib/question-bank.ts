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

/**
 * 选项乱序的确定性置换。
 *
 * 用 `questionId` 派生随机种子，因此**同一道题每次打开的顺序完全一致**：
 *   - 同一题在练习、考试、错题复盘里顺序相同，不会出现「这题我见过」却对不上
 *   - 已记录的作答（A/B/C/D）在下次打开时依然有意义
 *   - 服务端与客户端算出同样的结果，不会 hydration 不一致
 *
 * 返回 `map`：`map[显示位置] = 原始位置`。
 */
export function optionPermutation(seedKey: string): number[] {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < seedKey.length; i += 1) {
    h ^= seedKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return shuffle([0, 1, 2, 3], seededRandom(h >>> 0));
}

/** 恒等置换？顺序本来就等于原始顺序。 */
function isIdentity(map: number[]): boolean {
  return map.every((v, i) => v === i);
}

/** 字母 -> 位置下标（0..3） */
const toIndex = (letter: string) => letter.charCodeAt(0) - 65;
const toLetter = (index: number) => String.fromCharCode(65 + index);

/**
 * 选项乱序的完整坐标转换。
 *
 * 全站统一约定：**持久化与判分一律使用「原始空间」的字母**（即 dataset 中的
 * A/B/C/D 与 `answer`），只有在渲染与键盘/点击交互的边界上才换算成「显示空间」。
 * 这样选项乱序开关的切换不会影响任何已保存的作答 —— 否则用户在考试中途
 * 切换乱序，已经选过的题会因为字母含义变化而错位。
 */
export interface OptionSpace {
  /** map[显示位置] = 原始位置 */
  map: number[];
  shuffled: boolean;
  /** 显示顺序下的四项选项文本 */
  options: [string, string, string, string];
  /** 原始空间的选中项 -> 显示空间（升序） */
  toDisplaySelected: (sourceSelected: string[]) => string[];
  /** 显示空间的选中项 -> 原始空间（升序） */
  toSourceSelected: (displaySelected: string[]) => string[];
}

export function optionSpace(question: Question, shuffled: boolean): OptionSpace {
  const map = shuffled ? optionPermutation(question.questionId) : [0, 1, 2, 3];
  const options = map.map((i) => question.options[i]) as [
    string,
    string,
    string,
    string,
  ];

  if (isIdentity(map)) {
    const same = (s: string[]) => [...new Set(s)].sort();
    return {
      map,
      shuffled: false,
      options,
      toDisplaySelected: same,
      toSourceSelected: same,
    };
  }

  return {
    map,
    shuffled,
    options,
    toDisplaySelected: (sourceSelected) =>
      sourceSelected
        .map((l) => toLetter(map.indexOf(toIndex(l))))
        .filter((l) => l >= "A" && l <= "D")
        .sort(),
    toSourceSelected: (displaySelected) =>
      displaySelected
        .map((l) => {
          const pos = toIndex(l);
          return pos >= 0 && pos < map.length ? toLetter(map[pos]) : "";
        })
        .filter(Boolean)
        .sort(),
  };
}

/** 把答案字母从原始空间重映射到显示空间（升序）。 */
export function remapAnswer(answer: string, map: number[]): string {
  if (isIdentity(map)) return answer;
  return answer
    .split("")
    .map((letter) => {
      const moved = map.indexOf(toIndex(letter));
      return toLetter(moved < 0 ? toIndex(letter) : moved);
    })
    .sort()
    .join("");
}

/**
 * 生成「展示用」的题目：按需打乱选项，并同步重映射答案字母。
 *
 * 只用于渲染与判分展示；写回存储时必须换算回原始空间
 * （见 `optionSpace().toSourceSelected`）。`shuffled` 为 false 时原样返回，
 * 保证 /browse 这类需要与源题库逐字段对照的视图仍按原始顺序展示。
 */
export function displayQuestion(question: Question, shuffled: boolean): Question {
  if (!shuffled) return question;
  const map = optionPermutation(question.questionId);
  if (isIdentity(map)) return question;
  return {
    ...question,
    options: map.map((i) => question.options[i]) as [
      string,
      string,
      string,
      string,
    ],
    answer: remapAnswer(question.answer, map),
  };
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
