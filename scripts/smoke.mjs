#!/usr/bin/env node
/**
 * 冒烟测试：对运行中的站点做 HTTP 层检查（不含浏览器交互）。
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * 对两种目标都适用：
 *   - 开发服务器：      npm run dev            然后 node scripts/smoke.mjs http://localhost:3000
 *   - 静态导出产物：    npm run build && npm run serve:dist   然后 node scripts/smoke.mjs http://localhost:3000
 *
 * 说明：只断言「服务端渲染」就能确定的内容。练习/考试/统计等页面是客户端组件，
 * 首屏 HTML 里只有骨架屏，真实内容需要 hydration 后才出现 —— 那部分由
 * scripts/e2e.mjs（真实浏览器）覆盖。
 *
 * 注意：/browse 自静态导出改造后由客户端读取查询参数，其带参筛选内容
 * 同样只能由 e2e 覆盖，不在本脚本断言范围内。
 *
 * 覆盖点：
 *   1. 各路由 HTTP 200
 *   2. 服务端渲染内容正确（首页统计、浏览页题目、PWA 资源）
 *   3. 题库数据确实进入客户端 bundle
 *   4. 附图文件可通过 /figures/ 访问
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

/** 只断言服务端渲染内容 */
const checks = [
  {
    path: "/",
    name: "首页",
    expect: [
      "ham-exam",
      "业余无线电",
      "3108",
      "1375", // 唯一题号
      "53", // 附图数
      // 题库卡片把「A」与「类题库」放在相邻元素中，因此分开断言
      ">A</span>",
      "类题库",
      ">C</span>",
    ],
  },
  // ---- /browse 只断言外壳 ----
  // 静态导出后该页由客户端读取 ?bank= / ?scope= / ?page=，
  // 首屏 HTML 只有标题与骨架屏，带参筛选内容见 scripts/e2e.mjs。
  {
    path: "/browse?bank=A",
    name: "题库浏览（外壳）",
    expect: ["题库浏览"],
  },
  {
    path: "/browse?bank=C&scope=4.1.3",
    name: "题库浏览（知识点筛选外壳）",
    expect: ["题库浏览"],
  },
  {
    path: "/browse?bank=C&scope=4.4.1",
    name: "题库浏览（含附图知识点外壳）",
    expect: ["题库浏览"],
  },
  {
    path: "/browse?bank=B&page=3",
    name: "题库浏览（分页外壳）",
    expect: ["题库浏览"],
  },
  { path: "/figures/lk0597.jpg", name: "附图文件", expect: [], binary: true },
  { path: "/manifest.webmanifest", name: "PWA manifest", expect: ["ham-exam", "standalone"] },
  { path: "/sw.js", name: "Service Worker", expect: ["crac-shell", "crac-assets"] },
  { path: "/icon.svg", name: "应用图标 (svg)", expect: ["<svg"] },
  { path: "/icon-192.png", name: "应用图标 192", expect: [], binary: true },
  { path: "/icon-512.png", name: "应用图标 512", expect: [], binary: true },
  // ---- 数据下载入口 ----
  {
    path: "/downloads",
    name: "数据下载页",
    expect: ["数据下载", "题库原始 PDF", "ham-exam-figures.zip", "SHA-256", "ham-exam-questions-A.json"],
  },
  {
    path: "/downloads/ham-exam-questions-A.json",
    name: "处理后数据 (A)",
    expect: ['"questionId"', '"stem"', '"answer"', '"knowledgePoint"', '"options"'],
  },
  {
    path: "/downloads/ham-exam-dataset-A.json",
    name: "原始字段形态 (A)",
    expect: ['"question_id"', '"bank_id"', '"validation_notes"'],
  },
  {
    path: "/downloads/ham-exam-figures.json",
    name: "附图清单 (JSON)",
    expect: ['"figure_id"', '"file"'],
  },
  { path: "/downloads/ham-exam-figures.zip", name: "附图图片包 (ZIP)", expect: [], binary: true, zip: true },
  // 原始 PDF 是静态导出后的普通文件（由 scripts/prepare-downloads.mjs 复制进 public/）。
  // 纯静态托管不会下发 Content-Disposition: attachment —— 浏览器落盘名改由
  // 下载页 <a download="中文原名"> 指定，因此这里只校验 PDF 魔数。
  { path: "/downloads/ham-exam-bank-A.pdf", name: "原始 PDF 下载 (A)", expect: [], binary: true, pdf: true },
  { path: "/downloads/ham-exam-bank-figures.pdf", name: "原始 PDF (附图标记)", expect: [], binary: true, pdf: true },
  { path: "/robots.txt", name: "robots.txt", expect: [], allow404: true },
];

/** 只需可访问（内容由客户端渲染），返回 200 且是 HTML 即通过 */
const shellRoutes = [
  ["/practice?bank=A", "练习页外壳"],
  ["/practice?bank=C&mode=memorize", "背题模式外壳"],
  ["/exam", "考试组卷页外壳"],
  ["/review", "错题本外壳"],
  ["/stats?bank=B", "统计页外壳"],
];

let failed = 0;
let passed = 0;

/**
 * React 服务端渲染会在相邻文本节点之间插入 <!-- --> 注释，
 * 直接子串匹配会漏掉跨节点的中文句子，这里先去掉注释标记。
 */
const normalize = (html) => html.replace(/<!--[\s\S]*?-->/g, "");

const ok = (msg) => {
  passed += 1;
  console.log(`✓ ${msg}`);
};
const bad = (msg) => {
  failed += 1;
  console.log(`✗ ${msg}`);
};

for (const c of checks) {
  const url = `${BASE}${c.path}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (c.allow404 && res.status === 404) {
      ok(`${c.name.padEnd(26)} 404（可选文件，忽略）`);
      continue;
    }
    if (!res.ok) {
      bad(`${c.name.padEnd(26)} ${res.status} ${c.path}`);
      continue;
    }

    // 二进制资源：校验文件头魔数，避免「200 但是错误页」这种假通过
    if (c.binary) {
      const buf = Buffer.from(await res.arrayBuffer());
      const head = buf.subarray(0, 4);
      if (c.pdf) {
        if (head.toString("latin1") !== "%PDF") {
          bad(`${c.name.padEnd(26)} 不是 PDF（头部 ${JSON.stringify(head.toString("latin1"))}）`);
          continue;
        }
      }
      if (c.zip) {
        // 本地文件头 PK\x03\x04
        if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
          bad(`${c.name.padEnd(26)} 不是 ZIP（头部 ${head.toString("hex")}）`);
          continue;
        }
      }
      ok(`${c.name.padEnd(26)} ${res.status}  ${(buf.length / 1024).toFixed(0)}KB`);
      continue;
    }

    const raw = await res.text();
    const body = normalize(raw);
    const missing = c.expect.filter((needle) => !body.includes(needle));
    if (missing.length > 0) {
      bad(
        `${c.name.padEnd(26)} 缺少内容: ${missing.map((m) => JSON.stringify(m)).join(", ")}`,
      );
      continue;
    }
    ok(`${c.name.padEnd(26)} ${res.status}  ${body.length}B`);
  } catch (err) {
    bad(`${c.name.padEnd(26)} 请求失败: ${err.message}`);
  }
}

for (const [path, name] of shellRoutes) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
    const html = await res.text();
    const isHtml = /<html/i.test(html) && /_next\/static/.test(html);
    if (res.ok && isHtml) ok(`${name.padEnd(26)} ${res.status}  ${html.length}B`);
    else bad(`${name.padEnd(26)} ${res.status} 内容异常`);
  } catch (err) {
    bad(`${name.padEnd(26)} 请求失败: ${err.message}`);
  }
}

// 题库数据是否完整进入客户端 bundle（抽查题号与题干）
try {
  const html = await (await fetch(`${BASE}/practice?bank=C`)).text();
  const chunks = [
    ...new Set(
      [...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]),
    ),
  ];
  let found = null;
  for (const chunk of chunks) {
    const js = await fetch(`${BASE}${chunk}`).then((r) => (r.ok ? r.text() : ""));
    const needles = ["MC1-0943", "MC4-0142", "在电路中不受电阻阻碍的电流"];
    const hit = needles.find((n) => js.includes(n));
    if (hit) {
      found = { chunk, hit };
      break;
    }
  }
  if (found) {
    ok(`题库数据进入 bundle`.padEnd(26) + ` 命中 ${JSON.stringify(found.hit)}`);
  } else {
    bad(`题库数据进入 bundle`.padEnd(26) + ` 未在 ${chunks.length} 个 chunk 中找到题目`);
  }
} catch (err) {
  bad(`bundle 检查失败: ${err.message}`);
}

console.log(
  failed === 0
    ? `\n全部 ${passed} 项检查通过`
    : `\n通过 ${passed} 项，失败 ${failed} 项`,
);
process.exit(failed === 0 ? 0 : 1);
