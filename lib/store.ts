/**
 * 应用状态层：把 IndexedDB 持久化包装成可订阅的客户端 store，
 * 供 React 通过 useSyncExternalStore 使用（见 lib/use-store.ts）。
 *
 * 设计取舍：不使用服务端渲染任何用户数据 —— 所有进度都在浏览器本地，
 * 因此服务端渲染阶段 store 始终是「未加载」空态，避免 hydration 不一致。
 */
import { DEFAULT_LADDER, newCramItem } from "./cram";
import {
  STORES,
  idbClear,
  idbDelete,
  idbGetAll,
  idbPut,
  idbPutMany,
} from "./idb";
import {
  BANK_IDS,
  getQuestion,
  getQuestions,
  isCorrect,
  questionKey,
} from "./question-bank";
import type {
  Attempt,
  BankId,
  CramItem,
  CramPlan,
  ExamResult,
  ExamSession,
  KnowledgePointStat,
  Outcome,
  OverviewStats,
  PracticeSource,
  QuestionStat,
  SeqProgress,
  Settings,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  autoNext: true,
  showFigure: true,
  autoRemoveStreak: 2,
  shuffleOptions: false,
  recallAnswerOnly: false,
};

interface State {
  ready: boolean;
  storageError: string | null;
  stats: Record<string, QuestionStat>;
  attempts: Attempt[];
  seq: Record<string, SeqProgress>;
  exams: Record<string, ExamSession>;
  results: ExamResult[];
  settings: Settings;
  /** 突击模式：每题记忆状态 */
  cram: Record<string, CramItem>;
  /** 突击模式：当前计划（单行） */
  cramPlan: CramPlan | null;
}

const SETTINGS_ID = "app";

let state: State = {
  ready: false,
  storageError: null,
  stats: {},
  attempts: [],
  seq: {},
  exams: {},
  results: [],
  settings: DEFAULT_SETTINGS,
  cram: {},
  cramPlan: null,
};

const listeners = new Set<() => void>();

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): State {
  return state;
}

/** 供 useSyncExternalStore 用的快照：返回值必须稳定引用 */
export function getSnapshot(): State {
  return state;
}

export function getServerSnapshot(): State {
  return state;
}

let loadPromise: Promise<void> | null = null;

/** 首次访问时从 IndexedDB 载入全部数据（幂等，可安全多次调用）。 */
export function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [stats, attempts, seq, exams, results, settingsRows, cramRows, planRows] =
        await Promise.all([
          idbGetAll<QuestionStat>(STORES.stats),
          idbGetAll<Attempt>(STORES.attempts),
          idbGetAll<SeqProgress>(STORES.seq),
          idbGetAll<ExamSession>(STORES.exams),
          idbGetAll<ExamResult>(STORES.results),
          idbGetAll<Settings & { id: string }>(STORES.settings),
          idbGetAll<CramItem>(STORES.cram),
          idbGetAll<CramPlan>(STORES.cramPlan),
        ]);

      emit({
        ready: true,
        stats: Object.fromEntries(stats.map((s) => [s.key, s])),
        attempts: attempts.sort((a, b) => a.at - b.at),
        seq: Object.fromEntries(seq.map((s) => [s.id, s])),
        exams: Object.fromEntries(exams.map((e) => [e.id, e])),
        results: results.sort((a, b) => b.finishedAt - a.finishedAt),
        settings: { ...DEFAULT_SETTINGS, ...(settingsRows[0] ?? {}) },
        cram: Object.fromEntries(cramRows.map((c) => [c.key, c])),
        cramPlan: planRows[0] ?? null,
      });
    } catch (err) {
      emit({
        ready: true,
        storageError:
          err instanceof Error
            ? err.message
            : "本地存储不可用，本次练习进度不会被保存",
      });
    }
  })();
  return loadPromise;
}

// ---------------------------------------------------------------- 作答记录

export interface RecordInput {
  bank: BankId;
  question: { index: number; questionId: string; knowledgePoint: string; answer: string };
  selected: string[];
  source: PracticeSource;
  /** 显式指定结果；不传则按答案自动判定 */
  outcome?: Outcome;
}

/**
 * 记录一次作答：写流水 + 更新题目累计状态。
 * 返回本次结果，便于调用方决定是否自动跳题。
 */
export async function recordAttempt(input: RecordInput): Promise<Outcome> {
  const { bank, question, selected, source } = input;
  const key = `${bank}:${question.index}`;
  const outcome: Outcome =
    input.outcome ?? (isCorrect(selected, question.answer) ? "correct" : "wrong");

  const prev = state.stats[key];
  const stat: QuestionStat = {
    key,
    bank,
    questionId: question.questionId,
    knowledgePoint: question.knowledgePoint,
    attempts: (prev?.attempts ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (outcome === "correct" ? 1 : 0),
    wrong: (prev?.wrong ?? 0) + (outcome === "wrong" ? 1 : 0),
    lastOutcome: outcome,
    lastAt: Date.now(),
    streak: outcome === "correct" ? (prev?.streak ?? 0) + 1 : 0,
    starred: prev?.starred ?? false,
    mastered: prev?.mastered ?? false,
  };
  // 连续答对达到阈值 -> 自动移出错题本
  if (
    outcome === "correct" &&
    state.settings.autoRemoveStreak > 0 &&
    stat.streak >= state.settings.autoRemoveStreak &&
    stat.wrong > 0
  ) {
    stat.mastered = true;
  }
  if (outcome === "wrong") stat.mastered = false;

  const attempt: Attempt = {
    key,
    bank,
    questionId: question.questionId,
    knowledgePoint: question.knowledgePoint,
    at: stat.lastAt,
    selected,
    correctAnswer: question.answer,
    outcome,
    source,
  };

  emit({
    stats: { ...state.stats, [key]: stat },
    attempts: [...state.attempts, attempt],
  });

  await Promise.all([
    idbPut(STORES.stats, stat),
    idbPut(STORES.attempts, attempt),
  ]).catch(() => {
    emit({ storageError: "写入本地存储失败，进度可能未保存" });
  });

  return outcome;
}

export async function toggleStar(key: string): Promise<void> {
  const prev = state.stats[key];
  const located = getQuestion(key);
  if (!prev && !located) return;
  const base: QuestionStat =
    prev ??
    {
      key,
      bank: located!.bank,
      questionId: located!.question.questionId,
      knowledgePoint: located!.question.knowledgePoint,
      attempts: 0,
      correct: 0,
      wrong: 0,
      lastOutcome: "skipped",
      lastAt: Date.now(),
      streak: 0,
      starred: false,
      mastered: false,
    };
  const next: QuestionStat = { ...base, starred: !base.starred };
  emit({ stats: { ...state.stats, [key]: next } });
  await idbPut(STORES.stats, next).catch(() => undefined);
}

export async function setMastered(key: string, mastered: boolean): Promise<void> {
  const prev = state.stats[key];
  if (!prev) return;
  const next: QuestionStat = { ...prev, mastered };
  emit({ stats: { ...state.stats, [key]: next } });
  await idbPut(STORES.stats, next).catch(() => undefined);
}

// ---------------------------------------------------------------- 选择器

export function statOf(key: string): QuestionStat | undefined {
  return state.stats[key];
}

export function isStarred(key: string): boolean {
  return state.stats[key]?.starred ?? false;
}

/** 错题本：做错过且未标记为已掌握 */
export function wrongBookKeys(bank?: BankId): string[] {
  return Object.values(state.stats)
    .filter((s) => s.wrong > 0 && !s.mastered && (!bank || s.bank === bank))
    .sort((a, b) => b.lastAt - a.lastAt)
    .map((s) => s.key);
}

export function starredKeys(bank?: BankId): string[] {
  return Object.values(state.stats)
    .filter((s) => s.starred && (!bank || s.bank === bank))
    .sort((a, b) => b.lastAt - a.lastAt)
    .map((s) => s.key);
}

export function masteredCount(bank?: BankId): number {
  return Object.values(state.stats).filter(
    (s) => s.mastered && s.wrong > 0 && (!bank || s.bank === bank),
  ).length;
}

/** 按知识点聚合的掌握度 */
export function knowledgePointStats(bank: BankId): KnowledgePointStat[] {
  const agg = new Map<string, KnowledgePointStat>();
  for (const q of getQuestions(bank)) {
    const cur = agg.get(q.knowledgePoint) ?? {
      knowledgePoint: q.knowledgePoint,
      bank,
      total: 0,
      attempted: 0,
      correct: 0,
      wrong: 0,
      accuracy: 0,
    };
    cur.total += 1;
    const stat = state.stats[questionKey(bank, q)];
    if (stat && stat.attempts > 0) {
      cur.attempted += 1;
      cur.correct += stat.correct;
      cur.wrong += stat.wrong;
    }
    agg.set(q.knowledgePoint, cur);
  }
  for (const v of agg.values()) {
    const answered = v.correct + v.wrong;
    v.accuracy = answered > 0 ? v.correct / answered : -1;
  }
  return [...agg.values()].sort((a, b) =>
    a.knowledgePoint.localeCompare(b.knowledgePoint, "zh-Hans-CN", { numeric: true }),
  );
}

export function overviewStats(): OverviewStats {
  const attempts = state.attempts;
  const totalAttempts = attempts.length;
  const totalCorrect = attempts.filter((a) => a.outcome === "correct").length;

  const coveredByBank = { A: 0, B: 0, C: 0 } as Record<BankId, number>;
  const covered = new Set<string>();
  for (const s of Object.values(state.stats)) {
    if (s.attempts > 0) covered.add(s.key);
  }
  for (const key of covered) {
    const located = getQuestion(key);
    if (located) coveredByBank[located.bank] += 1;
  }

  // 最近 7 天
  const days: { date: string; attempts: number; correct: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const end = d.getTime() + 86400000;
    const inDay = attempts.filter((a) => a.at >= d.getTime() && a.at < end);
    days.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      attempts: inDay.length,
      correct: inDay.filter((a) => a.outcome === "correct").length,
    });
  }

  // 连续练习天数
  const dayKeys = new Set(
    attempts.map((a) => {
      const d = new Date(a.at);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }),
  );
  let streakDays = 0;
  for (let i = 0; ; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (dayKeys.has(d.getTime())) {
      streakDays += 1;
    } else if (i > 0 || !dayKeys.has(today.getTime())) {
      // 今天还没练不打断连续天数，从昨天开始算
      if (i === 0) continue;
      break;
    } else {
      break;
    }
  }

  return {
    totalAttempts,
    totalCorrect,
    accuracy: totalAttempts > 0 ? totalCorrect / totalAttempts : 0,
    wrongCount: wrongBookKeys().length,
    starredCount: starredKeys().length,
    masteredCount: masteredCount(),
    coveredQuestions: covered.size,
    coveredByBank,
    streakDays,
    last7Days: days,
  };
}

/** 各库整体进度（已作答去重题数 / 总题数） */
export function bankProgress(bank: BankId): { done: number; total: number } {
  let done = 0;
  for (const q of getQuestions(bank)) {
    const s = state.stats[questionKey(bank, q)];
    if (s && s.attempts > 0) done += 1;
  }
  return { done, total: getQuestions(bank).length };
}

// ---------------------------------------------------------------- 顺序练习断点

export function seqCursor(id: string): number {
  return state.seq[id]?.cursor ?? 0;
}

export async function saveSeqCursor(
  id: string,
  cursor: number,
  keys?: string[],
): Promise<void> {
  const row: SeqProgress = { id, cursor, updatedAt: Date.now(), ...(keys ? { keys } : {}) };
  emit({ seq: { ...state.seq, [id]: row } });
  await idbPut(STORES.seq, row).catch(() => undefined);
}

// ---------------------------------------------------------------- 考试

export async function saveExam(session: ExamSession): Promise<void> {
  emit({ exams: { ...state.exams, [session.id]: session } });
  await idbPut(STORES.exams, session).catch(() => undefined);
}

export function getExam(id: string): ExamSession | undefined {
  return state.exams[id];
}

export function activeExam(): ExamSession | undefined {
  return Object.values(state.exams)
    .filter((e) => !e.finishedAt)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
}

export async function deleteExam(id: string): Promise<void> {
  const next = { ...state.exams };
  delete next[id];
  emit({ exams: next });
  await idbDelete(STORES.exams, id).catch(() => undefined);
}

export async function saveResult(result: ExamResult): Promise<void> {
  emit({ results: [result, ...state.results] });
  await idbPut(STORES.results, result).catch(() => undefined);
}

// ---------------------------------------------------------------- 设置

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const settings = { ...state.settings, ...patch };
  emit({ settings });
  await idbPut(STORES.settings, { id: SETTINGS_ID, ...settings }).catch(
    () => undefined,
  );
}

// ---------------------------------------------------------------- 突击模式

const CRAM_PLAN_ID = "plan";

/**
 * 建立（或重建）突击计划：把该库全部题目初始化为 new。
 * 单事务批量写入，683 题量级下依然很快。
 */
export async function startCramPlan(
  bank: BankId,
  examAt: number,
  opts: { ladder?: number[]; batchSize?: number } = {},
): Promise<void> {
  const now = Date.now();
  const plan: CramPlan = {
    id: CRAM_PLAN_ID,
    bank,
    examAt,
    startedAt: now,
    ladder: opts.ladder ?? DEFAULT_LADDER,
    batchSize: opts.batchSize ?? 40,
  };
  const items: CramItem[] = getQuestions(bank).map((q) =>
    newCramItem(bank, questionKey(bank, q), now),
  );

  emit({ cramPlan: plan, cram: Object.fromEntries(items.map((i) => [i.key, i])) });
  await Promise.all([idbClear(STORES.cram), idbClear(STORES.cramPlan)])
    .then(() =>
      Promise.all([idbPutMany(STORES.cram, items), idbPut(STORES.cramPlan, plan)]),
    )
    .catch(() => emit({ storageError: "写入本地存储失败，突击计划可能未保存" }));
}

export async function saveCramItem(item: CramItem): Promise<void> {
  emit({ cram: { ...state.cram, [item.key]: item } });
  await idbPut(STORES.cram, item).catch(() => undefined);
}

/** 清空突击计划与进度（不影响练习/考试数据） */
export async function resetCramPlan(): Promise<void> {
  emit({ cram: {}, cramPlan: null });
  await Promise.all([idbClear(STORES.cram), idbClear(STORES.cramPlan)]).catch(
    () => undefined,
  );
}

// ---------------------------------------------------------------- 数据维护

/** 导出全部进度为可下载的 JSON（备份/迁移） */
export function exportProgress(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      stats: Object.values(state.stats),
      attempts: state.attempts,
      seq: Object.values(state.seq),
      results: state.results,
      settings: state.settings,
    },
    null,
    2,
  );
}

export async function importProgress(json: string): Promise<number> {
  const parsed = JSON.parse(json) as {
    stats?: QuestionStat[];
    attempts?: Attempt[];
    seq?: SeqProgress[];
    results?: ExamResult[];
    settings?: Partial<Settings>;
  };
  const stats = parsed.stats ?? [];
  const attempts = parsed.attempts ?? [];
  const seq = parsed.seq ?? [];
  const results = parsed.results ?? [];

  await Promise.all([
    idbPutMany(STORES.stats, stats),
    idbPutMany(STORES.attempts, attempts),
    idbPutMany(STORES.seq, seq),
    idbPutMany(STORES.results, results),
  ]);
  if (parsed.settings) await updateSettings(parsed.settings);

  // 重新载入，保证内存与磁盘一致
  loadPromise = null;
  await ensureLoaded();
  return stats.length + attempts.length;
}

/** 清空全部进度（保留设置） */
export async function resetProgress(): Promise<void> {
  await Promise.all([
    idbClear(STORES.stats),
    idbClear(STORES.attempts),
    idbClear(STORES.seq),
    idbClear(STORES.exams),
    idbClear(STORES.results),
  ]);
  emit({ stats: {}, attempts: [], seq: {}, exams: {}, results: [] });
}

/** 各库题量合计，用于首页展示 */
export function totalsByBank(): Record<BankId, number> {
  return Object.fromEntries(
    BANK_IDS.map((b) => [b, getQuestions(b).length]),
  ) as Record<BankId, number>;
}
