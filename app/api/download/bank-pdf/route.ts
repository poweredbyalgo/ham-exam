import { readFile } from "node:fs/promises";
import path from "node:path";
import { BANK_PDFS } from "@/lib/downloads";

/**
 * 题库原始 PDF 下载入口。
 *
 * 用路由处理器而不是把 PDF 放进 public/，原因有两个：
 *   1. 只暴露 BANK_PDFS 白名单里的 4 个文件，不会把 dataset/pdf/ 整个目录公开
 *   2. 可以精确控制 Content-Disposition，让中文文件名在各浏览器正确落盘
 *
 * 文件名走 RFC 5987 的 filename*（UTF-8 百分号编码），同时给出 ASCII 兜底。
 */

// 需要读取请求参数，因此按需渲染
export const dynamic = "force-dynamic";

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  const entry = BANK_PDFS.find((p) => p.id === id);

  if (!entry) {
    return new Response("未找到该文件。可用参数 id: " + BANK_PDFS.map((p) => p.id).join(" / "), {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // dataset/tools/sync-data.mjs -> dataset/tools -> dataset -> dataset/pdf
  const pdfPath = path.join(process.cwd(), "dataset", "pdf", entry.file);

  try {
    const data = await readFile(pdfPath);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(data.length),
        "Content-Disposition": contentDisposition(entry.file),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response(
      "服务器上找不到该题库 PDF。若仓库中删除了 dataset/ 目录，此入口不可用。",
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
}
