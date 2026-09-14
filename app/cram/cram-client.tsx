"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QuestionCard, type AnswerState, evaluate } from "@/components/question-card";
import { ProgressBar } from "@/components/progress-bar";
import { StickyActions } from "@/components/sticky-actions";
import {
  DEFAULT_LADDER,
  LAPSE_DELAY_MIN,
  buildSessionQueue,
  gradeCram,
  planSummary,
} from "@/lib/cram";
import { buildHint } from "@/lib/hint";
import {
  BANK_IDS,
  BANK_NAMES,
  displayQuestion,
  getQuestion,
  getQuestions,
  optionSpace,
} from "@/lib/question-bank";
import {
  recordAttempt,
  resetCramPlan,
  saveCramItem,
  saveSeqCursor,
  startCramPlan,
} from "@/lib/store";
import { useStore } from "@/lib/use-store";
import type { BankId, CramItem, CramPlan } from "@/lib/types";

const SESSION_SEQ_ID = "cram:session";

type View = "setup" | "overview" | "session" | "end";
type CardMode = "answer" | "flash";

/** 距考试的倒计时文案，如「还剩 1 天 3 小时」/「还剩 4 小时 12 分」。 */
function formatCountdown(ms: number): string {
  if (ms <= 0) return "考试时间已过";
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `还剩 ${d} 天 ${h} 小时`;
  if (h > 0) return `还剩 ${h} 小时 ${m} 分`;
  return `还剩 ${m} 分钟`;
}

/** datetime-local 输入框默认值：当前时间 + hours。 */
function defaultExamValue(hours = 48): string {
  const d = new Date(Date.now() + hours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 答错/没记住：回炉 —— 在当前题后若干位置重新插入，本会话内再见。 */
const reinsert = (list: string[], cursor: number, key: string): string[] => {
  const at = Math.min(cursor + 5, list.length);
  const out = list.slice();
  out.splice(at, 0, key);
  return out;
};

export function CramClient() {
  const { ready, settings, cram, cramPlan, seq } = useStore();
  // 计划存在与否决定 setup/overview；phase 只在有计划的场景内切换，
  // 避免用 effect 同步派生视图（渲染期即可确定，无级联渲染）。
  const [phase, setPhase] = useState<"idle" | "session" | "end">("idle");
  const view: View = !cramPlan ? "setup" : phase === "session" ? "session" : phase === "end" ? "end" : "overview";

  // 有计划的场景固定用计划里的库；没计划时 setup 里选的库暂存本地
  const bank: BankId = cramPlan?.bank ?? "A";
  const pool = useMemo(() => getQuestions(bank), [bank]);

  // 会话状态
  const [queue, setQueue] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  const [cardMode, setCardMode] = useState<CardMode>("answer");
  /** 闪卡模式是否已揭晓答案 */
  const [revealed, setRevealed] = useState(false);
  /** 判分后待推进的队列（答错的题已回炉插入） */
  const [pendingQueue, setPendingQueue] = useState<string[] | null>(null);
  const [round, setRound] = useState({ done: 0, correct: 0, lapses: 0 });

  // 倒计时刷新
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const summary = useMemo(
    () => (cramPlan ? planSummary(cram, cramPlan, now, pool) : null),
    [cramPlan, cram, now, pool],
  );

  const startSession = useCallback(() => {
    if (!cramPlan) return;
    const saved = seq[SESSION_SEQ_ID];
    if (saved?.keys && saved.keys.length > saved.cursor) {
      setQueue(saved.keys);
      setCursor(saved.cursor);
    } else {
      const q = buildSessionQueue(cram, cramPlan, Date.now(), pool);
      if (q.length === 0) return;
      setQueue(q);
      setCursor(0);
      void saveSeqCursor(SESSION_SEQ_ID, 0, q);
    }
    setSelected([]);
    setAnswerState("idle");
    setRevealed(false);
    setPendingQueue(null);
    setRound({ done: 0, correct: 0, lapses: 0 });
    setPhase("session");
  }, [cramPlan, seq, cram, pool]);

  const finishSession = useCallback(
    (finalQueue: string[]) => {
      void saveSeqCursor(SESSION_SEQ_ID, finalQueue.length, []);
      setPhase("end");
    },
    [],
  );

  /** 推进到下一题；队列耗尽则结束会话。 */
  const advance = useCallback(
    (nextQueue: string[]) => {
      const nextPos = cursor + 1;
      setSelected([]);
      setAnswerState("idle");
      setRevealed(false);
      if (nextPos >= nextQueue.length) {
        setQueue(nextQueue);
        finishSession(nextQueue);
      } else {
        setQueue(nextQueue);
        setCursor(nextPos);
        void saveSeqCursor(SESSION_SEQ_ID, nextPos, nextQueue);
      }
    },
    [cursor, finishSession],
  );

  /** 判分后不自动跳题：手机端让用户停留看清答案与秒记提示，手动下一题。 */
  const next = useCallback(() => {
    advance(pendingQueue ?? queue);
    setPendingQueue(null);
  }, [queue, pendingQueue, advance]);

  const applyGrade = useCallback(
    async (key: string, ok: boolean) => {
      if (!cramPlan) return;
      const prev: CramItem =
        cram[key] ?? { key, bank: cramPlan.bank, step: 0, dueAt: Date.now(), lapses: 0, status: "new", lastAt: 0 };
      await saveCramItem(gradeCram(prev, cramPlan, Date.now(), ok));
    },
    [cramPlan, cram],
  );

  const currentKey = queue[cursor];
  const located = currentKey ? getQuestion(currentKey) : null;
  const question = located?.question ?? null;

  const space = useMemo(
    () => (question ? optionSpace(question, settings.shuffleOptions) : null),
    [question, settings.shuffleOptions],
  );
  const shown = useMemo(
    () => (question ? displayQuestion(question, settings.shuffleOptions) : question),
    [question, settings.shuffleOptions],
  );
  const hint = useMemo(() => (shown ? buildHint(shown) : null), [shown]);

  /** 作答模式：提交判分后停留看秒记提示，手动下一题。 */
  const submit = useCallback(async () => {
    if (!question || !space || selected.length === 0 || answerState !== "idle") return;
    const sourceSelected = space.toSourceSelected(selected);
    const result = evaluate(question, sourceSelected);
    setAnswerState(result);
    const ok = result === "correct";
    await recordAttempt({ bank, question, selected: sourceSelected, source: "cram" });
    await applyGrade(currentKey, ok);
    setRound((r) => ({ done: r.done + 1, correct: r.correct + (ok ? 1 : 0), lapses: r.lapses + (ok ? 0 : 1) }));
    setPendingQueue(ok ? queue : reinsert(queue, cursor, currentKey));
  }, [question, space, selected, answerState, bank, currentKey, applyGrade, queue, cursor]);

  /** 闪卡模式：自评「记住了 / 没记住」后停留看提示。 */
  const selfGrade = useCallback(
    async (ok: boolean) => {
      if (!question || !revealed || answerState !== "idle") return;
      setAnswerState(ok ? "correct" : "wrong");
      await recordAttempt({ bank, question, selected: [], source: "cram", outcome: ok ? "correct" : "wrong" });
      await applyGrade(currentKey, ok);
      setRound((r) => ({ done: r.done + 1, correct: r.correct + (ok ? 1 : 0), lapses: r.lapses + (ok ? 0 : 1) }));
      setPendingQueue(ok ? queue : reinsert(queue, cursor, currentKey));
    },
    [question, revealed, answerState, bank, currentKey, applyGrade, queue, cursor],
  );

  /** 闪卡：先回忆再揭晓答案。 */
  const revealFlash = useCallback(() => {
    setRevealed(true);
  }, []);

  /** 切换作答/闪卡时重置当前题的中间状态（未判分则不记成绩）。 */
  const switchMode = useCallback(
    (mode: CardMode) => {
      if (mode === cardMode) return;
      setCardMode(mode);
      setSelected([]);
      setAnswerState("idle");
      setRevealed(false);
      setPendingQueue(null);
    },
    [cardMode],
  );

  // 闪卡模式快捷键：未揭晓时 Enter 揭晓；揭晓后 Enter 记住了、Backspace 没记住；自评后 Enter 下一题
  useEffect(() => {
    if (view !== "session" || cardMode !== "flash") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!revealed) revealFlash();
        else if (answerState === "idle") void selfGrade(true);
        else next();
      } else if (e.key === "Backspace" && revealed && answerState === "idle") {
        e.preventDefault();
        void selfGrade(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, cardMode, revealed, answerState, selfGrade, revealFlash, next]);

  if (!ready) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-full rounded-lg" />
        <div className="skeleton h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (view === "setup" || !cramPlan || !summary) {
    return <SetupView now={now} />;
  }

  if (view === "overview") {
    return (
      <OverviewView
        summary={summary}
        plan={cramPlan}
        now={now}
        onStart={startSession}
        onReset={async () => {
          if (window.confirm("确定清空突击计划与进度？练习和考试记录不受影响。")) {
            await resetCramPlan();
            setPhase("idle");
          }
        }}
      />
    );
  }

  if (view === "end") {
    const acc = round.done > 0 ? Math.round((round.correct / round.done) * 100) : 0;
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold">本轮完成 💪</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          共 {round.done} 题 · 正确率 {acc}% · 回炉 {round.lapses} 次
        </p>
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-subtle)]">
          建议休息 10 分钟再继续（间隔练习优于连续疲劳战）。答错的题会在约{" "}
          {LAPSE_DELAY_MIN} 分钟后到期重现。
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={startSession} disabled={summary.dueNow === 0 && summary.counts.new === 0}>
            开始下一轮
          </button>
          <button type="button" className="btn" onClick={() => setPhase("idle")}>
            回到总览
          </button>
        </div>
      </div>
    );
  }

  // ---- 会话态 ----
  if (!question || !shown) {
    // 队列为空或 key 失效：不在此处 setState（渲染期副作用），只给出出口
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-[var(--text-muted)]">当前队列已空。</p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => setPhase("idle")}>
          回到总览
        </button>
      </div>
    );
  }

  const flash = cardMode === "flash";
  const remaining = queue.length - cursor;
  /** 秒记提示：判分后（作答）或揭晓答案后（闪卡）显示 */
  const showHint = answerState !== "idle" || (flash && revealed);

  return (
    <div className="practice-page space-y-2 sm:space-y-4">
      <div className="card flex flex-nowrap items-center gap-2 p-2 sm:p-3">
        <span className="flex-none font-mono text-xs text-[var(--text-subtle)]">
          {cursor + 1}/{queue.length}
        </span>
        <div className="min-w-0 flex-1">
          <ProgressBar value={cursor + 1} max={queue.length} />
        </div>
        <div className="flex flex-none gap-0.5 rounded-lg bg-[var(--surface-2)] p-0.5" role="group" aria-label="切换突击作答方式">
          <button
            type="button"
            aria-pressed={!flash}
            className={`rounded-md px-2 py-1 text-xs font-medium ${!flash ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--text-muted)]"}`}
            onClick={() => switchMode("answer")}
          >
            作答
          </button>
          <button
            type="button"
            aria-pressed={flash}
            className={`rounded-md px-2 py-1 text-xs font-medium ${flash ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--text-muted)]"}`}
            onClick={() => switchMode("flash")}
          >
            闪卡
          </button>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm flex-none px-2"
          onClick={() => setPhase("idle")}
        >
          退出
        </button>
      </div>

      <QuestionCard
        bank={bank}
        question={shown}
        selected={flash ? (revealed ? shown.answer.split("") : []) : selected}
        onSelectedChange={setSelected}
        state={flash ? "idle" : answerState}
        reveal={flash && revealed}
        keyboard={!flash}
        onSubmit={() => void submit()}
        onNext={next}
        starred={false}
        positionLabel={`剩余 ${remaining} 题`}
        showFigure={settings.showFigure}
      />

      {showHint && hint && <HintCard hint={hint} />}

      {!showHint && flash && (
        <p className="px-1 text-xs text-[var(--text-subtle)]">
          先在心里回忆答案，再点「显示答案」对照自评。提取失败比反复阅读更能强化记忆。
        </p>
      )}

      <StickyActions aria-label="突击操作">
        {flash && !revealed ? (
          <button
            type="button"
            className="btn btn-primary min-w-0 flex-1 sm:flex-none"
            onClick={revealFlash}
          >
            显示答案
          </button>
        ) : flash && answerState === "idle" ? (
          <>
            <button type="button" className="btn min-w-0 flex-1" onClick={() => void selfGrade(false)}>
              没记住 <kbd className="kbd ml-1 hidden sm:inline-flex">⌫</kbd>
            </button>
            <button type="button" className="btn btn-primary min-w-0 flex-1" onClick={() => void selfGrade(true)}>
              记住了 <kbd className="kbd ml-1 hidden sm:inline-flex">↵</kbd>
            </button>
          </>
        ) : !flash && answerState === "idle" ? (
          <button
            type="button"
            className="btn btn-primary min-w-0 flex-1 sm:flex-none"
            onClick={() => void submit()}
            disabled={selected.length === 0}
          >
            提交答案
          </button>
        ) : (
          <>
            <span
              className={`chip flex-none ${answerState === "correct" ? "chip-success" : "chip-danger"}`}
              role="status"
            >
              {answerState === "correct" ? (flash ? "已记住" : "回答正确") : flash ? "没记住" : "答错 · 稍后回炉"}
            </span>
            <button type="button" className="btn btn-primary min-w-0 flex-1 sm:flex-none" onClick={next}>
              下一题 <kbd className="kbd ml-1 hidden sm:inline-flex">↵</kbd>
            </button>
          </>
        )}
        <span className="ml-auto hidden text-xs text-[var(--text-subtle)] sm:block">
          {formatCountdown(cramPlan.examAt - now)}
        </span>
      </StickyActions>
    </div>
  );
}

// ---------------------------------------------------------------- 秒记提示

function HintCard({ hint }: { hint: ReturnType<typeof buildHint> }) {
  return (
    <div className="card border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--accent-text)]">⚡ 秒记</span>
        <span className="font-mono text-xs text-[var(--text-muted)]">答案 {hint.answer}</span>
      </div>
      {hint.multi ? (
        <>
          <p className="mt-2 text-sm font-medium">
            <span className="text-[var(--success)]">✅ {hint.memory}</span>
            <span className="mx-2 text-[var(--text-subtle)]">·</span>
            <span className="text-[var(--danger)]">❌ {hint.trap}</span>
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed">
            {hint.options.map((o) => (
              <li key={o.letter} className="flex gap-1.5">
                <span className={o.correct ? "font-semibold text-[var(--success)]" : "text-[var(--text-subtle)]"}>
                  {o.correct ? "✅" : "❌"} {o.letter}
                </span>
                <span className={o.correct ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>{o.text}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium">
            记住 <span className="rounded bg-[var(--success)] px-1.5 py-0.5 text-white">{hint.memory}</span>
            {hint.trap && (
              <>
                <span className="mx-1.5 text-[var(--text-subtle)]">，别选成</span>
                <span className="rounded bg-[var(--danger)] px-1.5 py-0.5 text-white">{hint.trap}</span>
              </>
            )}
            {hint.trapLetter && (
              <span className="ml-1.5 text-xs font-normal text-[var(--text-subtle)]">
                （易混项：{hint.trapLetter}）
              </span>
            )}
          </p>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            正确项：<span className="font-semibold">{hint.answer}</span> {correctText(hint)}
          </p>
        </>
      )}
    </div>
  );
}

function correctText(hint: ReturnType<typeof buildHint>): string {
  return hint.options.find((o) => o.letter === hint.answer)?.text ?? "";
}

// ---------------------------------------------------------------- 设置态

function SetupView({ now }: { now: number }) {
  const [bank, setBank] = useState<BankId>("A");
  const [examAt, setExamAt] = useState(() => defaultExamValue(48));
  const [batch, setBatch] = useState(40);
  const [busy, setBusy] = useState(false);

  const examTs = new Date(examAt).getTime();
  const valid = Number.isFinite(examTs) && examTs > now;
  const hours = valid ? (examTs - now) / 3_600_000 : 0;
  const total = getQuestions(bank).length;

  const start = async () => {
    if (!valid) return;
    setBusy(true);
    await startCramPlan(bank, examTs, { ladder: DEFAULT_LADDER, batchSize: batch });
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="card p-4 sm:p-5">
        <h1 className="text-lg font-semibold">⚡ 考前突击</h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
          不从头刷到尾，而是让调度器按遗忘曲线安排每道题的复习时机：
          到期才出现、答对间隔拉长、答错 {LAPSE_DELAY_MIN} 分钟后回炉。
          48 小时内每题平均能过 4–5 遍，比通刷 5 遍记得牢。
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <span className="text-sm font-medium">题库</span>
            <div className="mt-1.5 flex gap-1.5">
              {BANK_IDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={b === bank}
                  className={`btn btn-sm ${b === bank ? "btn-primary" : ""}`}
                  onClick={() => setBank(b)}
                >
                  {BANK_NAMES[b]}（{getQuestions(b).length} 题）
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium">考试时间</span>
            <input
              type="datetime-local"
              value={examAt}
              min={defaultExamValue(1)}
              onChange={(e) => setExamAt(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-[var(--text-subtle)]">
              {valid
                ? `距考试约 ${Math.floor(hours / 24)} 天 ${Math.round(hours % 24)} 小时 · ${total} 题 · 预计需 ${Math.ceil((total * 20) / 60 / Math.max(1, hours / 24))} 分钟/天完成首刷`
                : "请选择未来的时间"}
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium">
              每轮新题 <span className="font-mono text-[var(--text-subtle)]">{batch}</span>
            </span>
            <input
              type="range"
              min={20}
              max={80}
              step={5}
              value={batch}
              onChange={(e) => setBatch(Number(e.target.value))}
              className="mt-1.5 w-full"
            />
            <span className="mt-1 block text-xs text-[var(--text-subtle)]">
              每轮引入的新题数量。组块越小，单轮越快、复习越及时。
            </span>
          </label>

          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={!valid || busy}
            onClick={() => void start()}
          >
            {busy ? "正在生成计划…" : "开始突击计划"}
          </button>
        </div>
      </section>

      <section className="card p-4 text-xs leading-relaxed text-[var(--text-muted)]">
        <h2 className="text-sm font-semibold text-[var(--text)]">为什么这样安排</h2>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li><strong>间隔重复</strong>：复习节奏 {DEFAULT_LADDER.join(" / ")} 分钟，在「快忘还没忘」时强化，记忆效率最高。</li>
          <li><strong>主动回忆</strong>：默认真实作答而非重读答案——提取练习的记忆效果是重读的 2–3 倍（测试效应）。</li>
          <li><strong>错误回炉</strong>：答错的题 {LAPSE_DELAY_MIN} 分钟后重现并回退间隔，直到提取成功。</li>
          <li><strong>章节交错</strong>：每轮新题跨章节轮转出题，避免连续同章造成的定势混淆。</li>
          <li><strong>睡眠巩固</strong>：Day1 睡前把当天错题过完，利用睡眠期间的记忆固化。</li>
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- 总览态

function OverviewView({
  summary,
  plan,
  now,
  onStart,
  onReset,
}: {
  summary: ReturnType<typeof planSummary>;
  plan: CramPlan;
  now: number;
  onStart: () => void;
  onReset: () => void;
}) {
  const { counts, dueNow, total, hoursToExam, nextSessionMinutes, progress } = summary;
  const canStart = dueNow > 0 || counts.new > 0;
  const allDone = !canStart;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">⚡ {BANK_NAMES[plan.bank]} 突击计划</h1>
          <span className="chip ml-auto">{formatCountdown(plan.examAt - now)}</span>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-subtle)]">
            <span>已掌握 {counts.mastered} / {total}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-1">
            <ProgressBar value={counts.mastered} max={total} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Stat label="未开始" value={counts.new} />
          <Stat label="到期待复习" value={dueNow} highlight={dueNow > 0} />
          <Stat label="已排期" value={counts.learning + counts.scheduled - dueNow} />
          <Stat label="已掌握" value={counts.mastered} />
        </div>

        <p className="mt-3 text-xs text-[var(--text-subtle)]">
          下一轮约 {dueNow + Math.min(plan.batchSize, counts.new)} 题 · 预计 {nextSessionMinutes} 分钟。
          {hoursToExam < 24 && counts.new > 0 && (
            <span className="ml-1 text-[var(--warn)]">剩余时间不足首刷，建议优先保证错题与到期题。</span>
          )}
        </p>

        {allDone ? (
          <div className="mt-4 rounded-xl border border-[var(--success)]/40 bg-[var(--success-soft)] p-4 text-sm text-[var(--success)]">
            全部题目已排满或掌握 ✅ 考前 2 小时可再回到这里，把当时到期的题最后过一轮。
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary mt-4 w-full"
            onClick={onStart}
          >
            {dueNow > 0 ? `开始本轮（${dueNow} 题到期）` : "开始学习新题"}
          </button>
        )}
      </section>

      <section className="card flex flex-wrap items-center gap-2 p-4 text-xs text-[var(--text-subtle)]">
        <span>复习阶梯 {plan.ladder.join(" / ")} 分钟 · 每轮新题 {plan.batchSize}</span>
        <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={onReset}>
          重置计划
        </button>
      </section>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface-2)]"
      }`}
    >
      <div className="font-mono text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-[var(--text-subtle)]">{label}</div>
    </div>
  );
}
