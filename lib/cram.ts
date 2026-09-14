/**
 * 突击模式调度引擎（纯函数，便于单独验证）。
 *
 * 记忆规律依据：
 *   - 间隔重复（艾宾浩斯遗忘曲线）：每题按阶梯 [立即, +10min, +1h, +6h, +24h]
 *     在「即将遗忘但还没忘」的时点安排复习；
 *   - 错误回炉（lapse）：答错的题缩短到 4 分钟后在本会话内重现，
 *     阶梯回退一级——提取失败需要更强的即时练习；
 *   - 组块 + 交错：新题按批引入，批内跨章节轮转取样，
 *     避免同章连续造成的定势混淆；
 *   - 考前边界：下次到期时间晚于考试时间的题目视为已掌握
 *     （不会再有复习机会，继续排队没有意义），总览会提示考前再跑一轮。
 */
import { chapterOf, questionKey } from "./question-bank";
import type { BankId, CramItem, CramPlan, Question } from "./types";

/** 间隔阶梯（分钟）。step 表示当前处于第几级，答对进入下一级。 */
export const DEFAULT_LADDER = [0, 10, 60, 360, 1440];

/** 答错 / 自评「没记住」后的回炉延迟（分钟），本会话内会再次出现。 */
export const LAPSE_DELAY_MIN = 4;

/** 不超过该间隔（分钟）视为「学习中」（本会话或临近），否则为「已排期」。 */
const LEARNING_THRESHOLD_MIN = 15;

const MINUTE = 60_000;

/** 初始化一题：尚未学习。 */
export function newCramItem(bank: BankId, key: string, now: number): CramItem {
  return {
    key,
    bank,
    step: 0,
    dueAt: now,
    lapses: 0,
    status: "new",
    lastAt: 0,
  };
}

/**
 * 对一题评分并给出新的调度状态。
 * ok=true 进入阶梯下一级；ok=false 回退一级并 4 分钟后回炉。
 * 阶梯走完、或下次到期晚于考试 -> mastered。
 */
export function gradeCram(
  item: CramItem,
  plan: CramPlan,
  now: number,
  ok: boolean,
): CramItem {
  if (ok) {
    const nextStep = item.step + 1;
    if (nextStep >= plan.ladder.length) {
      return { ...item, step: plan.ladder.length, dueAt: Infinity, status: "mastered", lastAt: now };
    }
    const dueAt = now + plan.ladder[nextStep] * MINUTE;
    if (dueAt >= plan.examAt) {
      return { ...item, step: nextStep, dueAt: Infinity, status: "mastered", lastAt: now };
    }
    return {
      ...item,
      step: nextStep,
      dueAt,
      status: plan.ladder[nextStep] <= LEARNING_THRESHOLD_MIN ? "learning" : "scheduled",
      lastAt: now,
    };
  }
  return {
    ...item,
    step: Math.max(0, item.step - 1),
    dueAt: now + LAPSE_DELAY_MIN * MINUTE,
    lapses: item.lapses + 1,
    status: "learning",
    lastAt: now,
  };
}

/** 当前到期（且未掌握）的题，按 dueAt 升序。 */
export function dueItems(items: Record<string, CramItem>, now: number): CramItem[] {
  return Object.values(items)
    .filter((i) => i.status !== "new" && i.status !== "mastered" && i.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt);
}

/** 尚未引入的新题（无 cram 记录或状态为 new）。 */
export function freshQuestions(
  pool: Question[],
  items: Record<string, CramItem>,
  bank: BankId,
): Question[] {
  return pool.filter((q) => {
    const it = items[questionKey(bank, q)];
    return !it || it.status === "new";
  });
}

/** 按章节轮转取样：1,2,3,4,5,1,2,3,... 保持各章相对顺序稳定。 */
export function interleaveByChapter(questions: Question[]): Question[] {
  const buckets = new Map<string, Question[]>();
  for (const q of questions) {
    const c = chapterOf(q.knowledgePoint);
    const list = buckets.get(c) ?? [];
    list.push(q);
    buckets.set(c, list);
  }
  const order = [...buckets.keys()].sort((a, b) => Number(a) - Number(b));
  const out: Question[] = [];
  for (;;) {
    let took = false;
    for (const c of order) {
      const list = buckets.get(c)!;
      if (list.length > 0) {
        out.push(list.shift()!);
        took = true;
      }
    }
    if (!took) break;
  }
  return out;
}

/**
 * 组装一次会话的题目 key 队列：
 *   1) 全部到期题（按 dueAt 升序，先还「记忆债」）
 *   2) 从新题中按章节交错补足 batchSize 道（组块引入）
 */
export function buildSessionQueue(
  items: Record<string, CramItem>,
  plan: CramPlan,
  now: number,
  pool: Question[],
): string[] {
  const due = dueItems(items, now).map((i) => i.key);
  const fresh = interleaveByChapter(freshQuestions(pool, items, plan.bank))
    .slice(0, plan.batchSize)
    .map((q) => questionKey(plan.bank, q));
  return [...due, ...fresh];
}

export interface CramSummary {
  total: number;
  counts: Record<CramItem["status"], number>;
  dueNow: number;
  /** 到期题 + 一批新题的预计用时（分钟，按 20 秒/题） */
  nextSessionMinutes: number;
  /** 距考试剩余小时 */
  hoursToExam: number;
  /** 已引入学习过的题数 */
  touched: number;
  /** 平均掌握进度（mastered / total） */
  progress: number;
}

/** 总览统计。 */
export function planSummary(
  items: Record<string, CramItem>,
  plan: CramPlan,
  now: number,
  pool: Question[],
): CramSummary {
  const counts: Record<CramItem["status"], number> = {
    new: 0,
    learning: 0,
    scheduled: 0,
    mastered: 0,
  };
  for (const q of pool) {
    const it = items[questionKey(plan.bank, q)];
    counts[it ? it.status : "new"] += 1;
  }
  const dueNow = dueItems(items, now).length;
  const freshLeft = counts.new;
  const nextCount = Math.min(dueNow + plan.batchSize, dueNow + freshLeft);
  return {
    total: pool.length,
    counts,
    dueNow,
    nextSessionMinutes: Math.ceil((nextCount * 20) / 60),
    hoursToExam: Math.max(0, (plan.examAt - now) / 3_600_000),
    touched: pool.length - freshLeft,
    progress: pool.length > 0 ? counts.mastered / pool.length : 0,
  };
}
