#!/usr/bin/env node
/**
 * 端到端测试：用本机已安装的 Edge（puppeteer-core 驱动）真实跑一遍核心流程。
 *
 *   node scripts/e2e.mjs [baseUrl]
 *
 * 覆盖：
 *   1. 首页、练习、考试、错题本、统计、浏览各页在真实浏览器中渲染出内容
 *   2. 练习：选中选项 → 提交 → 判分 → 自动跳下一题 → 进度写入 IndexedDB
 *   3. 键盘快捷键：A–D 选择、Enter 提交、方向键翻题、S 收藏
 *   4. 错题本：答错的题出现在错题本，可标记已掌握
 *   5. 模拟考试：组卷 → 答题 → 交卷 → 结果页显示分数
 *   6. 附图：含附图的题目渲染出 <img>
 *   7. 深色模式：切换后 <html> 带 dark class 且持久化
 *   8. 离线（PWA）：Service Worker 注册 + 断网后页面仍可打开
 *   9. 无 JS 降级：/browse 在禁用 JS 时仍输出题目
 */
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:3210";

const CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error("未找到 Edge/Chrome，无法执行端到端测试");
  process.exit(2);
}

let passed = 0;
let failed = 0;
const results = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`✓ ${name}${detail ? `  ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`✗ ${name}${detail ? `  ${detail}` : ""}`);
  }
  results.push({ name, ok, detail });
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,900"],
  defaultViewport: { width: 1280, height: 900 },
});

const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  // 浏览器对资源加载失败只给一句通用文案，URL 在 location() 里
  const loc = msg.location();
  consoleErrors.push(
    loc?.url ? `${msg.text()} [${loc.url}]` : msg.text(),
  );
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
const badResponses = [];
page.on("response", (r) => {
  if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
});

const text = async (sel) => page.$eval(sel, (el) => el.textContent ?? "");
const bodyText = async () => page.$eval("body", (el) => el.innerText);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ---------------------------------------------------------- 1. 首页
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  let body = await bodyText();
  check("首页渲染题库规模", body.includes("3108"), "含 3108 题");
  check("首页渲染三套题库入口", ["A", "B", "C"].every((b) => body.includes(`${b} 类`)));
  check("首页渲染进度概览", body.includes("总正确率"));
  check(
    "首页无 hydration 报错",
    !consoleErrors.some((e) => /hydrat/i.test(e)),
    consoleErrors.find((e) => /hydrat/i.test(e)) ?? "",
  );

  // ---------------------------------------------------------- 2. 练习流程
  await page.goto(`${BASE}/practice?bank=A`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".option", { timeout: 10000 });
  const firstStem = await text("h2");
  check("练习页渲染题目", firstStem.length > 4, firstStem.slice(0, 24));

  // 读出正确答案，模拟点击错误选项以验证判分与错题本
  const info = await page.evaluate(() => {
    const opts = [...document.querySelectorAll(".option")].map((b) => b.textContent);
    return { count: opts.length, position: document.querySelector(".font-mono")?.textContent };
  });
  check("练习页渲染 4 个选项", info.count === 4, `实际 ${info.count}`);

  // 键盘选择 A → Enter 提交
  await page.keyboard.press("KeyA");
  await sleep(120);
  const selectedCount = await page.$$eval(".option-selected", (els) => els.length);
  check("键盘 A 键选中选项", selectedCount === 1, `选中 ${selectedCount} 个`);

  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => !!document.querySelector(".option-correct"),
    { timeout: 5000 },
  );
  const hasVerdict = await page.evaluate(
    () =>
      !!document.querySelector(".chip-success, .chip-danger") &&
      document.querySelectorAll(".option-correct").length >= 1,
  );
  check("提交后显示判分与正确答案", hasVerdict);

  // 已写入 IndexedDB
  const dbInfo = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    return dbs.map((d) => d.name);
  });
  check("IndexedDB 已创建", dbInfo.includes("crac-practice"), dbInfo.join(","));

  const attemptCount = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("crac-practice");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("attempts", "readonly");
          const all = tx.objectStore("attempts").getAll();
          all.onsuccess = () => resolve(all.result.length);
          all.onerror = () => resolve(-1);
        };
        req.onerror = () => resolve(-1);
      }),
  );
  check("作答记录写入 IndexedDB", attemptCount >= 1, `${attemptCount} 条`);

  // S 键收藏
  await page.keyboard.press("KeyS");
  await sleep(200);
  const starred = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("crac-practice");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("stats", "readonly");
          const all = tx.objectStore("stats").getAll();
          all.onsuccess = () => resolve(all.result.filter((s) => s.starred).length);
          all.onerror = () => resolve(-1);
        };
        req.onerror = () => resolve(-1);
      }),
  );
  check("S 键收藏写入 IndexedDB", starred >= 1, `${starred} 条收藏`);

  // 方向键翻题
  const before = await text("h2");
  await page.keyboard.press("ArrowRight");
  await sleep(500);
  const after = await text("h2");
  check("方向键翻到下一题", before !== after, `${before.slice(0, 12)} → ${after.slice(0, 12)}`);

  // ---------------------------------------------------------- 3. 含附图题目
  await page.goto(`${BASE}/browse?bank=C&scope=4.4.1`, { waitUntil: "networkidle2" });
  const imgOk = await page.evaluate(() => {
    const img = document.querySelector("article img");
    if (!img) return { found: false };
    return { found: true, complete: img.complete, w: img.naturalWidth };
  });
  check(
    "附图题目渲染出图片",
    imgOk.found && imgOk.complete && imgOk.w > 0,
    `naturalWidth=${imgOk.w}`,
  );

  // ---------------------------------------------------------- 4. 错题本
  // 先回到练习页，故意答错一题，保证错题本有内容
  await page.goto(`${BASE}/practice?bank=A`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".option", { timeout: 10000 });
  await page.keyboard.press("KeyA");
  await sleep(100);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !!document.querySelector(".option-correct"), {
    timeout: 5000,
  });
  const correctLetters = await page.evaluate(() =>
    [...document.querySelectorAll(".option-correct .option-key")].map((e) => e.textContent),
  );
  // 重做并故意选一个不在正确答案里的选项
  await page.evaluate(() => {
    const back = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("重做本题"),
    );
    back?.click();
  });
  await sleep(250);
  const wrongLetter = ["A", "B", "C", "D"].find((l) => !correctLetters.includes(l));
  await page.keyboard.press(`Key${wrongLetter}`);
  await sleep(100);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !!document.querySelector(".chip-danger"), {
    timeout: 5000,
  });
  check(
    "故意答错后显示错误判定",
    true,
    `正确答案 ${correctLetters.join("")}，选了 ${wrongLetter}`,
  );

  await page.goto(`${BASE}/review`, { waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => document.body.innerText.includes("错题本与收藏"),
    { timeout: 8000 },
  );
  body = await bodyText();
  check("错题本页面可访问", body.includes("错题本与收藏"));
  const wrongCount = await page.evaluate(
    () => document.querySelectorAll("button[aria-expanded]").length,
  );
  check("错题本收录了答错的题", wrongCount >= 1, `${wrongCount} 条`);

  // 展开第一条，检查是否显示正确答案
  await page.click("button[aria-expanded]");
  await sleep(300);
  const expandedText = await bodyText();
  check("错题展开后显示正确答案", /正确答案|你的作答/.test(expandedText));

  // 逐题重做入口（此处曾出现 /review&redo=1 的坏链接）
  const redoHref = await page.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find((x) =>
      x.textContent?.includes("逐题重做"),
    );
    return a?.getAttribute("href") ?? null;
  });
  check(
    "「逐题重做」链接格式正确",
    redoHref !== null && redoHref.startsWith("/review?"),
    redoHref ?? "未找到链接",
  );
  if (redoHref) {
    const resp = await page.goto(`${BASE}${redoHref}`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".option", { timeout: 8000 });
    const redoBody = await bodyText();
    check(
      "逐题重做页可正常进入",
      (resp?.status() ?? 0) === 200 && /对 0|对\d|错 0|重做/.test(redoBody),
      `status=${resp?.status()}`,
    );
  }

  // ---------------------------------------------------------- 4b. 题库切换不串状态
  await page.goto(`${BASE}/practice?bank=A`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".option", { timeout: 8000 });
  const bankAStem = await text("h2");
  await page.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find((x) =>
      x.textContent?.trim() === "C 类",
    );
    a?.click();
  });
  await page.waitForFunction(
    () => location.search.includes("bank=C"),
    { timeout: 8000 },
  );
  await page.waitForSelector(".option", { timeout: 8000 });
  const bankCInfo = await page.evaluate(() => ({
    stem: document.querySelector("h2")?.textContent ?? "",
    chips: document.body.innerText,
  }));
  check(
    "切到 C 类题库后重新从第 1 题开始",
    bankCInfo.chips.includes("1 / 1282"),
    bankCInfo.chips.match(/\d+ \/ \d+/)?.[0] ?? "未找到进度",
  );
  void bankAStem;

  // ---------------------------------------------------------- 5. 统计
  await page.goto(`${BASE}/stats?bank=A`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("总正确率"), {
    timeout: 5000,
  });
  body = await bodyText();
  const acc = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) =>
      /^\d+(\.\d+)?%$/.test(d.textContent?.trim() ?? ""),
    );
    return el?.textContent?.trim() ?? "";
  });
  check("统计页显示正确率", /%$/.test(acc), acc);
  check("统计页显示章节掌握度", body.includes("章节掌握度"));
  check("统计页显示知识点明细", body.includes("知识点明细"));

  // ---------------------------------------------------------- 6. 模拟考试
  await page.goto(`${BASE}/exam`, { waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => b.textContent?.includes("开始考试")),
    { timeout: 5000 },
  );
  // 把题量调到最小，加快测试
  await page.evaluate(() => {
    const range = document.querySelector('input[type="range"]');
    if (range) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(range, "5");
      range.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await sleep(200);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("开始考试"),
    );
    btn.click();
  });
  await page.waitForSelector(".option", { timeout: 10000 });
  const examBody = await bodyText();
  check("考试页进入答题态", /已答|交卷/.test(examBody));

  // 答 5 题（每题选 A）
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press("KeyA");
    await sleep(120);
    const isLast = await page.evaluate(
      () =>
        !document.querySelector('button[aria-label*="，未作答"]')?.textContent ||
        [...document.querySelectorAll("button")].some((b) =>
          b.textContent?.includes("交卷并评分"),
        ),
    );
    void isLast;
    const nextBtn = await page.evaluateHandle(() =>
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("下一题"),
      ),
    );
    const disabled = await nextBtn.evaluate((b) => b.disabled);
    if (disabled) break;
    await nextBtn.evaluate((b) => b.click());
    await sleep(150);
  }

  // 交卷
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("交卷并评分"),
    );
    btn?.click();
  });
  await sleep(300);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("交卷评分"),
    );
    btn?.click();
  });
  await page.waitForFunction(() => location.pathname.includes("/exam/result"), {
    timeout: 10000,
  });
  await page.waitForFunction(() => document.body.innerText.includes("分"), { timeout: 5000 });
  body = await bodyText();
  check("考试交卷后跳转结果页", page.url().includes("/exam/result"));
  check("结果页显示得分", /分/.test(body) && /(达标|未达标)/.test(body));
  check("结果页显示失分知识点", body.includes("失分知识点分布") || body.includes("没有错题"));

  // ---------------------------------------------------------- 7. 深色模式
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  const beforeDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /主题|跟随系统|浅色|深色/.test(b.getAttribute("aria-label") ?? ""),
    );
    btn?.click();
  });
  await sleep(250);
  const afterDark = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    pref: document.documentElement.dataset.theme,
    stored: localStorage.getItem("crac-practice:theme"),
  }));
  check(
    "主题切换改变配色",
    afterDark.dark !== beforeDark || afterDark.pref !== "system",
    `theme=${afterDark.pref} dark=${afterDark.dark} stored=${afterDark.stored}`,
  );
  // 刷新后保持
  await page.reload({ waitUntil: "networkidle2" });
  const afterReload = await page.evaluate(() => ({
    pref: document.documentElement.dataset.theme,
    dark: document.documentElement.classList.contains("dark"),
  }));
  check(
    "主题偏好在刷新后保持",
    afterReload.pref === afterDark.pref && afterReload.dark === afterDark.dark,
    `theme=${afterReload.pref}`,
  );

  // ---------------------------------------------------------- 8. PWA / 离线
  const swState = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? (reg.active ? "active" : "registered") : "none";
  });
  check("Service Worker 已注册", swState === "active" || swState === "registered", swState);

  // 等待 SW 接管后再断网
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined).catch(() => undefined),
  );
  await sleep(1500);

  const offline = async (path, expectOptions = 4) => {
    await page.setOfflineMode(true);
    const out = { ok: false, detail: "" };
    try {
      const resp = await page.goto(`${BASE}${path}`, {
        waitUntil: "networkidle2",
        timeout: 15000,
      });
      await sleep(1200);
      const info = await page.evaluate(() => ({
        options: document.querySelectorAll(".option").length,
        len: document.body.innerText.length,
        text: document.body.innerText,
      }));
      // 浏览页是服务端渲染的纯 HTML，没有 .option 元素，用题干关键词判断
      const contentOk =
        expectOptions > 0
          ? info.options === expectOptions
          : /答案/.test(info.text) && info.len > 2000;
      out.ok = (resp?.status() ?? 0) === 200 && contentOk;
      out.detail = `status=${resp?.status()} options=${info.options} len=${info.len}`;
    } catch (err) {
      out.detail = err.message.slice(0, 60);
    }
    await page.setOfflineMode(false);
    return out;
  };

  const off1 = await offline("/practice?bank=A");
  check("断网后可进入练习页并渲染题目", off1.ok, off1.detail);

  const off2 = await offline("/browse?bank=A", 0);
  check("断网后可浏览题库", off2.ok, off2.detail);

  // ---------------------------------------------------------- 9. 无 JS 降级
  const noJsPage = await browser.newPage();
  await noJsPage.setJavaScriptEnabled(false);
  await noJsPage.goto(`${BASE}/browse?bank=A`, { waitUntil: "domcontentloaded" });
  const noJsBody = await noJsPage.$eval("body", (el) => el.innerText);
  check(
    "禁用 JS 时浏览页仍有题目内容",
    noJsBody.includes("答案") && noJsBody.length > 2000,
    `len=${noJsBody.length}`,
  );
  await noJsPage.close();

  // ---------------------------------------------------------- 10. 数据下载
  await page.goto(`${BASE}/downloads`, { waitUntil: "networkidle2" });
  const dlBody = await bodyText();
  check("数据下载页渲染原始 PDF 入口", dlBody.includes("题库原始 PDF"));
  check("数据下载页列出附图图片包", dlBody.includes("附图图片包"));
  check("数据下载页给出 SHA-256 校验值", dlBody.includes("SHA-256"));

  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a[download]")].map((a) => ({
      href: a.getAttribute("href"),
      text: a.textContent?.trim(),
    })),
  );
  check(
    "下载链接数量完整（4 个 PDF + 8 个数据文件）",
    links.length === 12,
    `实际 ${links.length} 个`,
  );
  check(
    "附图包下载链接指向 zip",
    links.some((l) => l.href === "/downloads/crac-figures.zip"),
  );

  // 实际点击一个 PDF 下载链接，确认返回的是真 PDF 且带附件头
  const pdfHref = links.find((l) => l.href?.startsWith("/api/download/bank-pdf"));
  const pdfProbe = await page.evaluate(async (href) => {
    const r = await fetch(href);
    const b = await r.arrayBuffer();
    const head = new TextDecoder("latin1").decode(new Uint8Array(b.slice(0, 4)));
    return {
      status: r.status,
      head,
      bytes: b.byteLength,
      disposition: r.headers.get("content-disposition") ?? "",
      type: r.headers.get("content-type") ?? "",
    };
  }, pdfHref.href);
  check(
    "原始 PDF 下载可用且文件有效",
    pdfProbe.status === 200 &&
      pdfProbe.head === "%PDF" &&
      pdfProbe.bytes > 100_000 &&
      pdfProbe.disposition.includes("attachment") &&
      pdfProbe.disposition.includes("filename*=UTF-8''"),
    `${(pdfProbe.bytes / 1024).toFixed(0)}KB ${pdfProbe.disposition.slice(0, 46)}`,
  );

  // 处理后 JSON 可直接解析
  const jsonProbe = await page.evaluate(async () => {
    const r = await fetch("/downloads/crac-questions-A.json");
    const j = await r.json();
    return {
      status: r.status,
      total: j.total,
      first: j.questions?.[0]?.questionId,
      hasOptionsArray: Array.isArray(j.questions?.[0]?.options),
    };
  });
  check(
    "处理后 JSON 可解析且结构正确",
    jsonProbe.status === 200 &&
      jsonProbe.total === 683 &&
      jsonProbe.hasOptionsArray === true,
    `total=${jsonProbe.total} 首题=${jsonProbe.first}`,
  );

  // 非法 id 应被白名单拒绝（这次请求是刻意制造的 404，下面统计错误时排除）
  const badIdUrl = `${BASE}/api/download/bank-pdf?id=../../package.json`;
  const badId = await page.evaluate(async () => {
    const r = await fetch("/api/download/bank-pdf?id=../../package.json");
    return r.status;
  });
  check("PDF 下载接口拒绝白名单外的 id", badId === 404, `status=${badId}`);

  // ---------------------------------------------------------- 11. 源数据提示已移除
  await page.goto(`${BASE}/practice?bank=A`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".option", { timeout: 10000 });
  // 第 14 题是 MC1-0014（源数据前缀与答案个数不一致的那道）
  await page.goto(`${BASE}/practice?bank=A&i=13`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".option", { timeout: 10000 });
  await page.keyboard.press("KeyA");
  await sleep(100);
  await page.keyboard.press("Enter");
  await sleep(500);
  const mismatchBody = await bodyText();
  check(
    "题目卡不再显示源数据提示",
    !mismatchBody.includes("源数据提示") &&
      !mismatchBody.includes("type_code_vs_answer_count_mismatch"),
  );
  check(
    "该题仍按多选正常判分（可选多个选项）",
    mismatchBody.includes("多选题") && mismatchBody.includes("知识点 1.1.2"),
  );

  // ---------------------------------------------------------- 12. 控制台错误与坏响应
  // 上面刻意发起的非法 id 请求会产生一条 404，属预期行为，统计时排除
  const intentional = [badIdUrl];
  const isIntentional = (s) => intentional.some((u) => s.includes(u));

  const realErrors = consoleErrors.filter(
    (e) =>
      !/favicon|Download the React DevTools|sw\.js/i.test(e) &&
      !isIntentional(e) &&
      !(/404/.test(e) && /bank-pdf/.test(e)),
  );
  check(
    "全程无未预期控制台错误",
    realErrors.length === 0,
    realErrors.slice(0, 2).join(" | "),
  );

  const realBad = badResponses.filter(
    (r) => !/favicon/i.test(r) && !isIntentional(r),
  );
  check(
    "全程无 4xx/5xx 资源响应（不含刻意测试的非法请求）",
    realBad.length === 0,
    realBad.slice(0, 3).join(" | "),
  );
} catch (err) {
  failed += 1;
  console.log(`✗ 测试执行中断: ${err.message}`);
} finally {
  await browser.close();
}

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
