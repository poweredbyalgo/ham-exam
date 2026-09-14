/**
 * 秒记提示生成器（纯函数）。
 *
 * 题库本身没有解析字段，这里从「正确选项 vs 干扰项的文本差异」自动生成
 * 好记的辨别提示：不追求严谨，只帮用户在 1 秒内看清
 * 「正确答案独有哪个词、最像的干扰项错在哪个词」。
 *
 * 算法：
 *   - 单选：用字符级 LCS 找正确项与「最相似干扰项」的差异，
 *     正确项独有片段 = 记忆点，干扰项独有片段 = 易错点；
 *   - 多选：直接给出 ✅ 该选 / ❌ 别选 的字母与文本，
 *     提醒「漏选、多选都算错」。
 */
import type { Question } from "./types";

export interface OptionHint {
  letter: string;
  text: string;
  correct: boolean;
}

export interface CramHint {
  multi: boolean;
  /** 正确答案字母（显示空间） */
  answer: string;
  /** 四项的 ✅/❌ 对照（显示空间顺序） */
  options: OptionHint[];
  /** 记忆点：正确项独有的关键词（单选）；多选为「选 X、Y」 */
  memory: string;
  /** 易错点：最相近干扰项独有的关键词（单选）；多选为「别选 Z」 */
  trap: string;
  /** 与之对比的最相似干扰项字母（单选） */
  trapLetter?: string;
}

/** 字符级 LCS 回溯，返回 a 中独有 / b 中独出的连续片段。 */
function diffRuns(a: string, b: string): { onlyA: string[]; onlyB: string[] } {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = a[i:] 与 b[j:] 的 LCS 长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  let i = 0;
  let j = 0;
  let runA = "";
  let runB = "";
  const flush = () => {
    if (runA.trim()) onlyA.push(runA.trim());
    if (runB.trim()) onlyB.push(runB.trim());
    runA = "";
    runB = "";
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      runA += a[i];
      i += 1;
    } else {
      runB += b[j];
      j += 1;
    }
  }
  while (i < n) {
    runA += a[i];
    i += 1;
  }
  while (j < m) {
    runB += b[j];
    j += 1;
  }
  flush();
  return { onlyA, onlyB };
}

/** 过滤掉太短/纯符号的片段，取最有信息量的前两段。 */
function pickKey(runs: string[]): string {
  const useful = runs
    .map((r) => r.replace(/[，。、；：""''（）()\s]/g, ""))
    .filter((r) => r.length >= 2)
    .sort((x, y) => y.length - x.length)
    .slice(0, 2);
  return useful.join("、");
}

/** 相似度：LCS 长度 / 较长串长度。 */
function similarity(a: string, b: string): number {
  const { onlyA } = diffRuns(a, b);
  const removed = onlyA.reduce((s, r) => s + r.length, 0);
  return 1 - removed / Math.max(a.length, b.length, 1);
}

const LETTERS = ["A", "B", "C", "D"];

/** 为一道（显示空间的）题目生成秒记提示。 */
export function buildHint(shown: Question): CramHint {
  const answerSet = new Set(shown.answer.split(""));
  const options: OptionHint[] = LETTERS.map((letter, idx) => ({
    letter,
    text: shown.options[idx],
    correct: answerSet.has(letter),
  }));
  const multi = options.filter((o) => o.correct).length > 1;
  const correct = options.filter((o) => o.correct);
  const wrong = options.filter((o) => !o.correct);

  if (multi) {
    return {
      multi: true,
      answer: shown.answer,
      options,
      memory: `选 ${correct.map((o) => o.letter).join("、")}`,
      trap: wrong.length > 0 ? `别选 ${wrong.map((o) => o.letter).join("、")}（漏选/多选都算错）` : "四个全选",
    };
  }

  const correctText = correct[0]?.text ?? "";
  // 找与正确项最相似的干扰项——它才是真正会选错的那个
  let nearest = wrong[0];
  let best = -1;
  for (const w of wrong) {
    const s = similarity(correctText, w.text);
    if (s > best) {
      best = s;
      nearest = w;
    }
  }
  const { onlyA, onlyB } = diffRuns(correctText, nearest?.text ?? "");
  return {
    multi: false,
    answer: shown.answer,
    options,
    memory: pickKey(onlyA) || correct[0]?.letter || "",
    trap: pickKey(onlyB) || nearest?.letter || "",
    trapLetter: nearest?.letter,
  };
}
