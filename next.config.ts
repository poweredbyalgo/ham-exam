import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * 纯静态导出：`next build` 产出可直接托管的 HTML/CSS/JS，产物目录见 outDir。
   *
   * 约定（改动前请先确认下游是否依赖）：
   *   - 不含 Route Handler / 服务端渲染 —— 应用本身没有服务端状态，
   *     题库数据在构建期内联进 chunk，进度存在浏览器 IndexedDB。
   *   - 因此 /api/* 接口不可用，可下载的二进制文件一律放进 public/。
   *   - 页面查询参数（?bank= / ?page= 等）由客户端组件读取，
   *     每页只预渲染一份 HTML 外壳。
   */
  output: "export",

  /**
   * 静态导出目录：Next.js 默认写 `out/`，这里改为 `dist/`。
   *
   * 机制（next/dist/build/index.js）：`output: "export"` 时 Next 读取
   * distDir 作为导出目录（outDir），同时把编译器自身的 distDir 重置为
   * `.next`，因此构建内部文件不会和静态产物混在一起 ——
   * `npm run build` 后 dist/ 根目录就是可直接部署的静态站点。
   *
   * 注意：不要写成 `dist/.next` 这类嵌套路径。判断逻辑只把
   * distDir 整体当作导出目录，嵌套写法会把导出结果落进 dist/.next/，
   * 与构建内部文件混作一团。
   */
  distDir: "dist",

  /**
   * 附图在 public/figures 下，文件名已归一化为小写。
   *
   * 注意：纯静态导出不会应用这些响应头（next build 会给出 export-no-custom-routes
   * 警告），它们只在自建 Node 托管或 `next dev` 下生效。静态托管请在
   * 托管方配置等价规则（见 docs/WEB.md「静态托管」一节）。
   */
  async headers() {
    return [
      {
        source: "/figures/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
