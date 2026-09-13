"use client";

import { useRef, useState } from "react";
import { dataIndex } from "@/lib/question-bank";
import {
  exportProgress,
  importProgress,
  resetProgress,
  updateSettings,
} from "@/lib/store";
import { useStore } from "@/lib/use-store";

/** 设置与数据管理：练习偏好、进度导出/导入/清空。 */
export function SettingsPanel() {
  const { settings, totalAttempts } = useSettingsSource();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const download = () => {
    const json = exportProgress();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crac-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("进度已导出为 JSON 文件。");
  };

  const upload = async (file: File) => {
    try {
      const n = await importProgress(await file.text());
      setMessage(`已导入 ${n} 条记录。`);
    } catch (err) {
      setMessage(
        `导入失败：${err instanceof Error ? err.message : "文件格式不正确"}`,
      );
    }
  };

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">设置与数据</h2>

      <div className="mt-3 space-y-3">
        <ToggleRow
          label="答对后自动跳到下一题"
          desc="关闭后需要手动点「下一题」"
          checked={settings.autoNext}
          onChange={(v) => void updateSettings({ autoNext: v })}
        />
        <ToggleRow
          label="显示附图"
          desc="题目引用电路图或天线图时展示图片"
          checked={settings.showFigure}
          onChange={(v) => void updateSettings({ showFigure: v })}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <div className="text-sm">错题自动移出阈值</div>
            <div className="text-xs text-[var(--text-subtle)]">
              连续答对多少次后自动移出错题本（0 表示不自动移出）
            </div>
          </div>
          <select
            className="input w-24"
            value={settings.autoRemoveStreak}
            onChange={(e) =>
              void updateSettings({ autoRemoveStreak: Number(e.target.value) })
            }
          >
            {[0, 1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "不自动" : `${n} 次`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <h3 className="text-sm font-medium">进度数据</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-subtle)]">
          全部进度保存在本机浏览器（IndexedDB），不会上传到任何服务器。
          当前共 {totalAttempts} 条作答记录，数据版本 {dataIndex.dataVersion}。
          清除浏览器数据会一并删除进度，建议定期导出备份。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={download}>
            导出进度
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => fileRef.current?.click()}
          >
            导入进度
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          {confirmReset ? (
            <>
              <button
                type="button"
                className="btn btn-sm"
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                onClick={() => {
                  void resetProgress();
                  setConfirmReset(false);
                  setMessage("已清空全部练习进度。");
                }}
              >
                确认清空（不可恢复）
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setConfirmReset(false)}
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setConfirmReset(true)}
            >
              清空进度
            </button>
          )}
        </div>
        {message && (
          <p className="mt-2 text-xs text-[var(--accent-text)]" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

function useSettingsSource() {
  const state = useStore();
  return {
    settings: state.settings,
    totalAttempts: state.attempts.length,
  };
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 flex-none accent-[var(--accent)]"
      />
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-[var(--text-subtle)]">{desc}</span>
      </span>
    </label>
  );
}
