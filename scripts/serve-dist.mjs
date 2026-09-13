#!/usr/bin/env node
/**
 * 静态产物预览服务器 —— 用与正式托管相同的方式服务 dist/。
 *
 *   node scripts/serve-dist.mjs [端口]      （默认 3000）
 *
 * 为什么需要它：`next start` 只服务 .next 的 Node 运行时，读不了纯静态导出；
 * 而 `python -m http.server` 不会把 /browse/ 映射到 browse/index.html，
 * 会让人误以为构建坏了。这里按静态托管的常规约定实现：
 *
 *   - 目录请求 -> 该目录下的 index.html
 *   - 无扩展名的路径 -> 先试 <path>/index.html，再试 <path>.html
 *   - 带扩展名的路径 -> 直接读文件
 *   - RSC 导航负载 -> <route>/__next.<name>/__PAGE__.txt
 *   - 目录穿越（..）一律 404
 *
 * 只用于本地验证，不要放进生产。
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** 把 URL 路径解析成 dist/ 下的真实文件，找不到返回 null。 */
async function resolveFile(pathname) {
  // 解码后归一化，并确认没有逃出 DIST（防目录穿越）
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const target = path.resolve(DIST, "." + decoded);
  if (target !== DIST && !target.startsWith(DIST + path.sep)) return null;

  // 1) 精确命中
  if (await isFile(target)) return target;

  // 2) 目录形态：/browse/ 或 /browse -> browse/index.html
  if (await isFile(path.join(target, "index.html"))) {
    return path.join(target, "index.html");
  }

  // 3) 无扩展名补 .html：/browse -> browse.html
  if (!path.extname(target) && (await isFile(`${target}.html`))) {
    return `${target}.html`;
  }

  /**
   * 4) RSC 导航负载。
   *
   * 客户端路由请求 `<route>/__next.<name>.__PAGE__.txt`，静态导出把它存成
   * `<route>/<dir>/__PAGE__.txt`。目录名的构成规则是：`__next` 加上负载名
   * 的前 k 段（点分连接），负载名剩余段作为目录名之后的路径；k 由磁盘决定。
   * 实测三例：
   *
   *   /practice/__next.practice.__PAGE__.txt
   *     -> dist/practice/__next.practice/__PAGE__.txt        （k=1，无尾段）
   *   /exam/__next.exam.__PAGE__.txt
   *     -> dist/exam/__next.exam/__PAGE__.txt                 （k=1，无尾段）
   *   /exam/result/__next.exam.result.__PAGE__.txt
   *     -> dist/exam/result/__next.exam/result/__PAGE__.txt   （k=1，尾段 result）
   *
   * 注意第三例：末段来自负载名而非路由名，两者拼出来的路径不同，所以对 k
   * 逐个试而不是只假设一种排布。少这一条时站内点击会 404，表现为客户端导航失败。
   * （`__next._full.txt` / `__next._tree.txt` 是真实文件，第 1 条即命中。）
   */
  const rsc = /^(.*)\/(__next\..*?)\.__PAGE__\.txt$/.exec(decoded);
  if (rsc) {
    const routePrefix = rsc[1];                     // 例 "/exam/result"
    const name = rsc[2];                            // 例 "__next.exam.result"
    const segs = routePrefix ? routePrefix.split("/").slice(1) : [];

    // 目录名 = [路由段...] + "__next" + 负载名的前 k 段（点分连接），
    // 负载名剩余段跟在目录名之后。k 从「全进目录名」递减到「全进路径」，
    // 逐个试、以磁盘为准。
    const parts = name.split(".").slice(1); // 去掉 "__next"，例 ["exam","result"]
    for (let k = parts.length; k >= 0; k -= 1) {
      const dirParts = parts.slice(0, k);
      const trailing = parts.slice(k);
      const dirName = ["__next", ...dirParts].join(".");
      const candidate = `/${[...segs, dirName, ...trailing].join("/")}/__PAGE__.txt`;
      const p = path.resolve(DIST, "." + candidate);
      if (p.startsWith(DIST + path.sep) && (await isFile(p))) return p;
    }
  }

  return null;
}

if (!(await isFile(path.join(DIST, "index.html")))) {
  console.error(`未找到 ${path.join(DIST, "index.html")}，请先运行：npm run build`);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const file = await resolveFile(pathname);

  if (!file) {
    // 静态站点没有服务端兜底路由，未命中就是 404
    const notFound = await resolveFile("/404.html");
    res.writeHead(404, { "Content-Type": MIME[".html"] });
    if (notFound) {
      createReadStream(notFound).pipe(res);
    } else {
      res.end(`404 Not Found: ${pathname}`);
    }
    return;
  }

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    // 构建产物内容哈希命名，本地预览不做缓存，避免改动后看到旧文件
    "Cache-Control": "no-cache",
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`静态产物预览： http://localhost:${PORT}`);
  console.log(`服务目录：     ${DIST}`);
  console.log("按 Ctrl+C 停止。");
});
