import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 shrink-0"
      aria-label="返回首页"
    >
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white"
      >
        HX
      </span>
      {!compact && (
        <span className="font-semibold tracking-tight whitespace-nowrap">
          ham-exam
        </span>
      )}
    </Link>
  );
}
