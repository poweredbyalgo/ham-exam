import { Suspense } from "react";
import { BrowseClient } from "./browse-client";

export const metadata = { title: "题库浏览" };

/**
 * 与 practice / exam / review / stats 保持同一形态：
 * 服务端组件只负责套 Suspense 外壳（useSearchParams 要求），
 * 查询参数真正的读取在 BrowseClient 里。
 */
export default function BrowsePage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full rounded-xl" />}>
      <BrowseClient />
    </Suspense>
  );
}
