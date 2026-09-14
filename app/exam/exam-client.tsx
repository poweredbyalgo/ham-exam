"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuestionCard } from "@/components/question-card";
import { StickyActions } from "@/components/sticky-actions";
import {
  BANK_IDS,
  BANK_NAMES,
  bankMeta,
  displayQuestion,
  getQuestion,
  getQuestions,
  isCorrect,
  optionSpace,
  questionKey,
  seededRandom,
  shuffle,
} from "@/lib/question-bank";
import {
  isStarred,
  recordAttempt,
  saveExam,
  saveResult,
  toggleStar,
} from "@/lib/store";
import { useStore } from "@/lib/use-store";
import type {
  BankId,
  ExamConfig,
  ExamSession,
  Question,
} from "@/lib/types";

/** 各组卷参数的默认值：题量与限时按该库题量给出合理默认。 */
function defaultConfig(bank: BankId): ExamConfig {
  const total = bankMeta[bank].total;
  const count = bank === "A" ? 40 : bank === "B" ? 50 : 60;
  return {
    bank,
    count: Math.min(count, total),
    minutes: Math.round(Math.min(count, total) * 1.2),
    passRate: 90,
    includeMultiple: true,
    seed: Date.now() % 100000,
  };
}

export function ExamClient() {
  const params = useSearchParams();
  const sessionId = params.get("session");
  return sessionId ? <ExamRunner id={sessionId} /> : <ExamSetup />;
}

// ---------------------------------------------------------------- 组卷

function ExamSetup() {
  const router = useRouter();
  const { ready } = useStore();

  // 每个题库各自保留一份组卷配置：切换题库时回到该库的默认值，
  // 无需用 effect 回写 state（避免级联渲染）。
  const [bank, setBankState] = useState<BankId>("A");
  const [configs, setConfigs] = useState<Record<BankId, ExamConfig>>(() => ({
    A: defaultConfig("A"),
    B: defaultConfig("B"),
    C: defaultConfig("C"),
  }));
  const config = configs[bank];
  const setConfig = useCallback(
    (patch: Partial<ExamConfig> | ((c: ExamConfig) => ExamConfig)) => {
      setConfigs((prev) => {
        const cur = prev[bank];
        const next = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
        return { ...prev, [bank]: next };
      });
    },
    [bank],
  );
  const setBank = useCallback((b: BankId) => setBankState(b), []);

  const pool = useMemo(() => {
    const all = getQuestions(bank);
    return config.includeMultiple ? all : all.filter((q) => q.type !== "multiple");
  }, [bank, config.includeMultiple]);

  const start = () => {
    const rand = seededRandom(config.seed);
    const picked = shuffle(pool, rand).slice(0, Math.min(config.count, pool.length));
    const keys = picked.map((q) => questionKey(bank, q));
    const session: ExamSession = {
      id: `exam-${Date.now().toString(36)}`,
      config: { ...config, bank, count: keys.length },
      keys,
      answers: {},
      remaining: config.minutes * 60,
      startedAt: Date.now(),
      finishedAt: null,
    };
    void saveExam(session);
    router.push(`/exam?session=${session.id}`);
  };

  const passCount = Math.ceil((config.count * config.passRate) / 100);

  return (
    <div className="space-y-4">
      <header className="card p-5">
        <h1 className="text-lg font-semibold">模拟考试</h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
          按题库随机组卷并限时作答，交卷后立即评分并给出失分知识点分布。同一套卷的随机种子会保存在链接中，便于复盘与分享。
        </p>
      </header>

      <section className="card space-y-4 p-5">
        <fieldset>
          <legend className="text-sm font-medium">题库</legend>
          <div className="mt-2 flex gap-2">
            {BANK_IDS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBank(b)}
                aria-pressed={bank === b}
                className={`btn ${bank === b ? "btn-primary" : ""}`}
              >
                {BANK_NAMES[b]}
                <span className="font-mono text-xs opacity-70">
                  {bankMeta[b].total}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">
              题量 <span className="font-mono text-[var(--text-subtle)]">{config.count}</span>
            </span>
            <input
              type="range"
              min={5}
              max={Math.max(5, pool.length)}
              step={5}
              value={config.count}
              onChange={(e) =>
                setConfig((c) => ({ ...c, count: Number(e.target.value) }))
              }
              className="mt-2 w-full accent-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text-subtle)]">
              当前题库可抽题 {pool.length} 道
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium">
              限时{" "}
              <span className="font-mono text-[var(--text-subtle)]">
                {config.minutes} 分钟
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={180}
              step={5}
              value={config.minutes}
              onChange={(e) =>
                setConfig((c) => ({ ...c, minutes: Number(e.target.value) }))
              }
              className="mt-2 w-full accent-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text-subtle)]">
              0 表示不限时
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium">
              及格线{" "}
              <span className="font-mono text-[var(--text-subtle)]">{config.passRate}%</span>
            </span>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={config.passRate}
              onChange={(e) =>
                setConfig((c) => ({ ...c, passRate: Number(e.target.value) }))
              }
              className="mt-2 w-full accent-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text-subtle)]">
              需答对 {passCount} 题
            </span>
          </label>

          <label className="flex items-start gap-2 pt-6">
            <input
              type="checkbox"
              checked={config.includeMultiple}
              onChange={(e) =>
                setConfig((c) => ({ ...c, includeMultiple: e.target.checked }))
              }
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-sm">
              包含多选题
              <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">
                多选题需选全所有正确选项才算得分
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
          <button type="button" className="btn btn-primary" onClick={start} disabled={!ready}>
            开始考试
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setConfig((c) => ({ ...c, seed: Math.floor(Math.random() * 100000) }))}
          >
            换一套卷
          </button>
          <span className="text-xs text-[var(--text-subtle)]">
            种子 {config.seed}
          </span>
        </div>
      </section>

      <RecentResults />
    </div>
  );
}

// ---------------------------------------------------------------- 考试进行

function ExamRunner({ id }: { id: string }) {
  const router = useRouter();
  const { ready, exams, settings } = useStore();
  const session = exams[id];

  const [pos, setPos] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const finishing = useRef(false);

  // 计时：基于 startedAt 推算，避免标签页后台被节流导致计时不准
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = session ? Math.floor((now - session.startedAt) / 1000) : 0;
  const remaining =
    session && session.config.minutes > 0
      ? Math.max(0, session.config.minutes * 60 - elapsed)
      : null;

  const finish = useCallback(async () => {
    if (!session || finishing.current) return;
    finishing.current = true;
    setConfirming(false);

    // 先给未作答的题补记 skip，再统一判分
    const finishedAt = Date.now();
    let correct = 0;
    let blank = 0;
    const miss = new Map<string, number>();

    for (const key of session.keys) {
      const located = getQuestion(key);
      if (!located) continue;
      // 会话里存的是原始空间的选择（A/B/C/D 对应 dataset 顺序），
      // 因此切换选项乱序不会让已作答的题错位；这里直接按原始空间判分。
      const picked = session.answers[key]?.selected ?? [];
      const ok = picked.length > 0 && isCorrect(picked, located.question.answer);
      if (ok) {
        correct += 1;
      } else {
        if (picked.length === 0) blank += 1;
        miss.set(
          located.question.knowledgePoint,
          (miss.get(located.question.knowledgePoint) ?? 0) + 1,
        );
      }
      // 全部作答（含未作答）都进入历史与错题本
      await recordAttempt({
        bank: session.config.bank,
        question: located.question,
        selected: picked,
        source: "exam",
        outcome: ok ? "correct" : "wrong",
      });
    }

    const total = session.keys.length;
    const score = total > 0 ? (correct / total) * 100 : 0;

    await saveExam({
      ...session,
      finishedAt,
      remaining: remaining ?? 0,
      answers: Object.fromEntries(
        session.keys.map((k) => [
          k,
          { key: k, selected: session.answers[k]?.selected ?? [], submitted: true },
        ]),
      ),
    });
    await saveResult({
      id: session.id,
      bank: session.config.bank,
      finishedAt,
      durationSec: Math.round((finishedAt - session.startedAt) / 1000),
      total,
      correct,
      wrong: total - correct,
      blank,
      score,
      passed: score >= session.config.passRate,
      passRate: session.config.passRate,
      knowledgePointMiss: [...miss.entries()]
        .map(([knowledgePoint, count]) => ({ knowledgePoint, count }))
        .sort((a, b) => b.count - a.count || a.knowledgePoint.localeCompare(b.knowledgePoint)),
    });

    router.replace(`/exam/result?session=${session.id}`);
  }, [session, remaining, router]);

  // 倒计时归零自动交卷
  useEffect(() => {
    if (remaining === 0 && session && !session.finishedAt && ready) {
      void finish();
    }
  }, [remaining, session, ready, finish]);

  // 若会话已结束（例如上次已交卷），直接跳结果页
  useEffect(() => {
    if (session?.finishedAt) router.replace(`/exam/result?session=${id}`);
  }, [session, id, router]);

  if (!ready) {
    return <div className="skeleton h-64 w-full rounded-xl" />;
  }
  if (!session) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          找不到这场考试（可能已被清理或链接失效）。
        </p>
        <Link href="/exam" className="btn btn-primary mt-4">
          重新组卷
        </Link>
      </div>
    );
  }

  const question = getQuestion(session.keys[pos])?.question as Question | undefined;
  if (!question) {
    return (
      <div className="card p-6 text-center text-sm text-[var(--text-muted)]">
        题目数据缺失。
      </div>
    );
  }

  // 选项乱序坐标转换：session.answers 存的始终是「原始空间」字母，
  // 交互与渲染用「显示空间」。原始空间是持久化字面量，因此乱序开关
  // 的切换不会影响已保存的作答。
  const space = optionSpace(question, settings.shuffleOptions);
  const shownQuestion = displayQuestion(question, settings.shuffleOptions);
  const currentSource = session.answers[session.keys[pos]]?.selected ?? [];
  // 考试过程中不判分：优先用本次交互的显示空间选择，否则把已存的原始空间选择换算过来
  const effectiveSelected =
    selected.length > 0 ? selected : space.toDisplaySelected(currentSource);

  const persistAnswer = (displaySelected: string[]) => {
    void saveExam({
      ...session,
      answers: {
        ...session.answers,
        [session.keys[pos]]: {
          key: session.keys[pos],
          // 换算回原始空间后落盘
          selected: space.toSourceSelected(displaySelected),
          submitted: false,
        },
      },
    });
  };

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(session.keys.length - 1, next));
    setPos(clamped);
    const nextQ = getQuestion(session.keys[clamped])?.question;
    const nextSource = session.answers[session.keys[clamped]]?.selected ?? [];
    // selected 是显示空间的状态，进入新题时换算到该题的显示空间
    setSelected(
      nextQ && nextSource.length > 0
        ? optionSpace(nextQ, settings.shuffleOptions).toDisplaySelected(nextSource)
        : [],
    );
    window.scrollTo({ top: 0 });
  };

  const answeredCount = session.keys.filter(
    (k) => (session.answers[k]?.selected?.length ?? 0) > 0,
  ).length;

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 card flex flex-wrap items-center gap-3 p-3">
        <span className="font-mono text-sm">
          {pos + 1}
          <span className="text-[var(--text-subtle)]">/{session.keys.length}</span>
        </span>
        <span className="chip chip-accent">{BANK_NAMES[session.config.bank]}</span>
        <span className="text-xs text-[var(--text-subtle)]">
          已答 {answeredCount} 题
        </span>
        <div className="ml-auto flex items-center gap-2">
          {remaining !== null && (
            <span
              className={`font-mono text-sm tabular-nums ${
                remaining < 60 ? "text-[var(--danger)] font-semibold" : ""
              }`}
              role="timer"
              aria-live={remaining < 60 ? "polite" : "off"}
            >
              {formatDuration(remaining)}
            </span>
          )}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setConfirming(true)}
          >
            交卷
          </button>
        </div>
      </div>

      <QuestionCard
        bank={session.config.bank}
        question={shownQuestion}
        selected={effectiveSelected}
        onSelectedChange={(next) => {
          // 考试中不即时判分，也不回显对错：只记录选择
          setSelected(next);
          persistAnswer(next);
        }}
        state="idle"
        reveal={false}
        keyboard
        onSubmit={() => goTo(pos + 1)}
        onNext={() => goTo(pos + 1)}
        onPrev={() => goTo(pos - 1)}
        starred={isStarred(session.keys[pos])}
        onToggleStar={() => void toggleStar(session.keys[pos])}
        positionLabel={`第 ${pos + 1} 题`}
        showFigure={settings.showFigure}
      />

      <AnswerSheet
        session={session}
        pos={pos}
        onJump={(i) => goTo(i)}
      />

      <StickyActions>
        <button
          type="button"
          className="btn flex-none"
          onClick={() => goTo(pos - 1)}
          disabled={pos === 0}
        >
          ← 上一题
        </button>
        <button
          type="button"
          className="btn flex-none"
          onClick={() => {
            setSelected([]);
            persistAnswer([]);
          }}
        >
          清除
        </button>
        <button
          type="button"
          className="btn btn-primary flex-none"
          onClick={() => goTo(pos + 1)}
          disabled={pos >= session.keys.length - 1}
        >
          下一题 →
        </button>
        <button
          type="button"
          className="btn btn-ghost flex-none sm:ml-auto"
          onClick={() => setConfirming(true)}
        >
          交卷并评分
        </button>
      </StickyActions>

      {confirming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="card w-full max-w-sm p-5">
            <h2 id="confirm-title" className="font-semibold">
              确认交卷？
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              共 {session.keys.length} 题，已作答 {answeredCount} 题
              {answeredCount < session.keys.length && (
                <>
                  ，还有{" "}
                  <strong className="text-[var(--warn)]">
                    {session.keys.length - answeredCount}
                  </strong>{" "}
                  题未作答（计为错题）
                </>
              )}
              。
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => void finish()}
              >
                交卷评分
              </button>
              <button
                type="button"
                className="btn flex-1"
                onClick={() => setConfirming(false)}
              >
                继续答题
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 答题卡：一眼看清哪些题未作答，并支持跳转。 */
function AnswerSheet({
  session,
  pos,
  onJump,
}: {
  session: ExamSession;
  pos: number;
  onJump: (i: number) => void;
}) {
  return (
    <details className="card p-3">
      <summary className="cursor-pointer text-sm font-medium">
        答题卡
        <span className="ml-2 text-xs font-normal text-[var(--text-subtle)]">
          点击题号可直接跳转
        </span>
      </summary>
      <ol className="mt-3 grid grid-cols-8 gap-1.5 sm:grid-cols-12 md:grid-cols-16">
        {session.keys.map((key, i) => {
          const answered = (session.answers[key]?.selected?.length ?? 0) > 0;
          const active = i === pos;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-current={active ? "true" : undefined}
                aria-label={`第 ${i + 1} 题${answered ? "，已作答" : "，未作答"}`}
                className={`w-full rounded-md border py-1 text-center font-mono text-xs transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : answered
                      ? "border-transparent bg-[var(--success-soft)] text-[var(--success)]"
                      : "border-[var(--border)] text-[var(--text-subtle)] hover:border-[var(--accent)]"
                }`}
              >
                {i + 1}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex gap-4 text-xs text-[var(--text-subtle)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-[var(--success-soft)]" /> 已作答
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-[var(--border)]" /> 未作答
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-[var(--accent)]" /> 当前题
        </span>
      </div>
    </details>
  );
}

function RecentResults() {
  const { ready, results } = useStore();
  if (!ready) return <div className="skeleton h-24 w-full rounded-xl" />;
  if (results.length === 0) return null;

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">历史成绩</h2>
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {results.slice(0, 8).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="chip">{BANK_NAMES[r.bank]}</span>
            <span className="font-mono tabular-nums">
              {r.correct}/{r.total}
            </span>
            <span
              className={`font-mono font-semibold ${
                r.passed ? "text-[var(--success)]" : "text-[var(--danger)]"
              }`}
            >
              {r.score.toFixed(0)} 分
            </span>
            <span className="text-xs text-[var(--text-subtle)]">
              {new Date(r.finishedAt).toLocaleString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" · 用时 "}
              {formatDuration(r.durationSec)}
            </span>
            <Link
              href={`/exam/result?session=${r.id}`}
              className="btn btn-ghost btn-sm ml-auto"
            >
              查看
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}
