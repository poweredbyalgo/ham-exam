/** 题库与应用数据的公共类型定义。 */

export type BankId = "A" | "B" | "C";

/** 题目形态：以答案选项个数判定（源题库 type_code 可能与之不符，见 issues）。 */
export type QuestionType = "single" | "multiple" | "other";

/** 规范化后的题目记录（由 scripts/sync-data.mjs 从 dataset/ 生成）。 */
export interface Question {
  /** 在所属题库中的 1-based 序号 */
  index: number;
  /** 源文件 [I] 字段，如 "MC1-0943" */
  questionId: string;
  /** 源文件 [J] 字段（总题库编号），部分题目在源文件中为空字符串 */
  bankId: string;
  /** 源文件 [P] 字段，格式 章节.小节.条目 */
  knowledgePoint: string;
  type: QuestionType;
  /** 源文件题型前缀：MC1 单选，MC2/MC3/MC4 多选 */
  typeCode: string;
  stem: string;
  /** 固定 4 项，下标 0..3 对应选项 A..D */
  options: [string, string, string, string];
  /** 正确答案字母，如 "A"、"AB"、"ABCD" */
  answer: string;
  /** 附图文件名，如 "LK0597.jpg"；无附图为 null */
  figure: string | null;
  /** 源数据自检标记，如 type_code_vs_answer_count_mismatch */
  issues: string[];
}

export interface FigureMeta {
  id: string;
  file: string;
  page: number;
  width: number;
  height: number;
}

export interface ChapterMeta {
  chapter: string;
  name: string;
  count: number;
}

export interface BankMeta {
  id: BankId;
  name: string;
  sourceFile: string;
  total: number;
  figures: number;
  multipleChoice: number;
  singleChoice: number;
  knowledgePoints: number;
  chapters: ChapterMeta[];
}

export interface DataIndex {
  dataVersion: string;
  generatedFrom: string;
  note: string;
  totals: {
    questions: number;
    uniqueQuestionIds: number;
    figureReferences: number;
    figureFiles: number;
    sharedAcrossBanks: number;
  };
  banks: Record<BankId, BankMeta>;
}

/** 做题结果 */
export type Outcome = "correct" | "wrong" | "skipped";

/** 单次作答记录（错题本与统计的基础） */
export interface Attempt {
  /** 题目定位键，见 lib/question-bank.ts 的 questionKey() */
  key: string;
  bank: BankId;
  questionId: string;
  knowledgePoint: string;
  /** 作答时间戳 */
  at: number;
  selected: string[];
  correctAnswer: string;
  outcome: Outcome;
  /** 来源：练习 / 考试 / 错题重做 */
  source: PracticeSource;
}

export type PracticeSource = "practice" | "exam" | "review" | "browse";

/** 每道题的累计状态（用于进度、错题本、收藏） */
export interface QuestionStat {
  key: string;
  bank: BankId;
  questionId: string;
  knowledgePoint: string;
  attempts: number;
  correct: number;
  wrong: number;
  lastOutcome: Outcome;
  lastAt: number;
  /** 连续答对次数，达到阈值后自动移出错题本 */
  streak: number;
  starred: boolean;
  /** 已被移出错题本（用户确认掌握） */
  mastered: boolean;
}

/** 顺序练习的断点续做位置 */
export interface SeqProgress {
  /** `${bank}:${scope}` */
  id: string;
  cursor: number;
  updatedAt: number;
}

export type ThemePreference = "system" | "light" | "dark";

export interface Settings {
  theme: ThemePreference;
  /** 答对后自动跳到下一题 */
  autoNext: boolean;
  /** 练习时是否显示附图 */
  showFigure: boolean;
  /** 错题连续答对几次后自动移出（0 表示不自动移除） */
  autoRemoveStreak: number;
  /** 选项乱序：打乱 A–D 的展示顺序（按题目 ID 确定性打乱，顺序稳定可复现） */
  shuffleOptions: boolean;
  /** 背题模式只显示正确答案，不展示全部选项 */
  recallAnswerOnly: boolean;
}

/** 统计面板用 */
export interface KnowledgePointStat {
  knowledgePoint: string;
  bank: BankId;
  total: number;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number;
}

export interface OverviewStats {
  totalAttempts: number;
  totalCorrect: number;
  accuracy: number;
  wrongCount: number;
  starredCount: number;
  masteredCount: number;
  /** 已作答过的题目数（去重） */
  coveredQuestions: number;
  /** 各库已覆盖题数 */
  coveredByBank: Record<BankId, number>;
  streakDays: number;
  last7Days: { date: string; attempts: number; correct: number }[];
}

/** 模拟考试配置 */
export interface ExamConfig {
  bank: BankId;
  count: number;
  /** 限时（分钟），0 表示不限时 */
  minutes: number;
  /** 及格线（百分比） */
  passRate: number;
  includeMultiple: boolean;
  /** 随机种子，便于复现与分享 */
  seed: number;
}

export interface ExamAnswer {
  key: string;
  selected: string[];
  /** 是否已提交 */
  submitted: boolean;
}

export interface ExamSession {
  id: string;
  config: ExamConfig;
  keys: string[];
  answers: Record<string, ExamAnswer>;
  /** 剩余秒数，用于刷新后恢复计时 */
  remaining: number;
  startedAt: number;
  finishedAt: number | null;
}

export interface ExamResult {
  id: string;
  bank: BankId;
  finishedAt: number;
  durationSec: number;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  score: number;
  passed: boolean;
  passRate: number;
  knowledgePointMiss: { knowledgePoint: string; count: number }[];
}
