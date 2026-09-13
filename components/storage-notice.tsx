"use client";

import { useState } from "react";
import { useStore } from "@/lib/use-store";

/** 本地存储不可用（隐私模式、配额耗尽等）时给出一次性提示。 */
export function StorageNotice() {
  const { ready, storageError } = useStore();
  const [dismissed, setDismissed] = useState(false);

  if (!ready || !storageError || dismissed) return null;

  return (
    <div
      role="alert"
      className="border-b border-[var(--warn)]/30 bg-[var(--warn-soft)] px-4 py-2 text-sm text-[var(--warn)]"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <span className="flex-1">{storageError}</span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setDismissed(true)}
        >
          知道了
        </button>
      </div>
    </div>
  );
}
