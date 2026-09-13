# CRAC 智能练习系统

面向中国业余无线电**操作技术能力验证**（A / B / C 类）的刷题系统，基于 **Next.js 16（App Router）+ React 19 + TypeScript + Tailwind CSS v4**。

题库数据直接来自本仓库 `dataset/` 中经过校验的题库（`dataset/tools/verify_bank.py` 可复现校验），共 **3108 道题**（1375 个唯一题号）、**53 张**电路与天线附图。所有练习进度保存在浏览器本地 **IndexedDB**，无需注册、无需后端、断网可用。

> 仓库根目录就是 Next.js 应用根目录，可直接作为 GitHub 仓库并一键部署。题库原始资料与处理管线位于 `dataset/`，详见根目录 [README](../README.md)。

---

## 快速开始

```bash
npm install
npm run dev          # http://localhost:3000
```

生产构建与运行：

```bash
npm run build
npm run start        # 默认 http://localhost:3000
```

其他命令：

| 命令 | 说明 |
| --- | --- |
| `npm run sync-data` | 由 `dataset/` 重新生成 `data/*.json`（字段重塑，不改题目内容） |
| `npm run dataset:build` | 从题库 PDF 重建 `dataset/*.json` 与 `public/figures/`（需 Python + pymupdf） |
| `npm run dataset:verify` | 校验 `dataset/*.json` 与题库 PDF 逐字段一致 |
| `npm run make-icons` | 重新生成 PWA 的 PNG 图标（192 / 512） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint（`eslint-config-next`） |
| `npm run check` | typecheck + lint + build |
| `npm run test:smoke` | HTTP 层冒烟测试（默认 `http://localhost:3000`） |
| `npm run test:e2e` | 真实浏览器端到端测试（需本机安装 Edge/Chrome） |

两个测试脚本都接受自定义地址：`node scripts/e2e.mjs http://localhost:3210`。

---

## 功能

### 练习
- **顺序练习**：按题库原始顺序或指定章节 / 知识点逐题作答，自动记录断点，下次从上次位置继续。
- **背题模式**：题干与正确答案同时展示，适合考前快速过题；不计入正确率。
- **判定规则**：与源题库一致 —— 多选题需**选全**所有正确选项才算答对。
- **附图**：78 处题目引用附图，可直接渲染并点击放大查看。
- **键盘操作**：`A`–`D` 选择、`Enter` 提交 / 下一题、`←` `→` 翻题、`S` 收藏、`Esc` 关闭图片放大。

### 模拟考试
- 按题库随机组卷，可配置**题量、限时、及格线、是否含多选题**。
- 组卷使用带种子的伪随机（mulberry32）：同一 `seed` 复现同一套卷，便于复盘。
- 考试过程**不即时判分、不回显对错**；计时基于 `startedAt` 推算，标签页被后台节流也不会走偏；倒计时归零自动交卷。
- 答题卡显示每题作答状态，可点击跳转；交卷后给出得分、达标判定、用时，以及**按失分题数排序的知识点分布**，并支持逐题复盘（错题 / 未答 / 全部）。

### 错题本与收藏
- 练习和考试中答错的题自动进入错题本；**连续答对 N 次后自动移出**（N 可配置，默认 2）。
- 支持手动「我已掌握，移出错题本」、收藏重点题、按题库筛选、**逐题重做**。

### 统计
- 总正确率、累计作答、已作答题目去重数、连续练习天数。
- 各题库进度条、最近 7 天作答量与正确占比柱状图。
- **章节掌握度**与**知识点明细**（可只看薄弱项，正确率 < 80%），每个知识点可直接跳去练习。

### 其他
- **题库浏览**：服务端渲染的纯 HTML 题目列表，支持章节/知识点筛选与分页，禁用 JavaScript 也能用。
- **深色模式**：跟随系统 / 浅色 / 深色三态，内联脚本在首帧前决定配色，无闪白；偏好持久化。
- **PWA**：可安装到桌面；Service Worker 采用「导航 network-first + 静态资源 cache-first」，首次访问后完全离线可用。
- **数据管理**：进度可导出为 JSON 备份、导入恢复、一键清空。

---

## 架构

```
（仓库根 = Next.js 应用根）
├─ app/                        Next.js App Router
│  ├─ layout.tsx               外壳：主题内联脚本、导航、SW 注册
│  ├─ page.tsx                 首页（服务端）+ HomeOverview（客户端）
│  ├─ practice/                顺序练习 / 背题模式
│  ├─ exam/                    组卷 → 答题 → 成绩（含 result/ 子路由）
│  ├─ review/                  错题本 / 收藏夹 / 已掌握 + 逐题重做
│  ├─ stats/                   掌握度统计 + 设置与数据管理
│  ├─ browse/                  题库浏览（服务端渲染）
│  ├─ downloads/               数据下载页（服务端渲染）
│  └─ api/download/bank-pdf/   原始题库 PDF 白名单下载接口
├─ components/                 复用组件（题目卡、复盘列表、选择器…）
├─ lib/
│  ├─ types.ts                 全部数据类型
│  ├─ question-bank.ts         题库访问层（唯一数据入口）
│  ├─ downloads.ts             PDF 白名单（与 sync-data.mjs 保持一致）
│  ├─ idb.ts                   IndexedDB 极简 Promise 封装
│  ├─ store.ts                 可订阅状态层（作答、统计、设置…）
│  ├─ use-store.ts             useSyncExternalStore 绑定
│  └─ theme.ts / theme-script.ts  主题三态与防闪白脚本
├─ data/                       由 sync-data 生成（questions/figures/index/downloads）
├─ public/
│  ├─ figures/                 53 张附图（由 build_dataset.py 直接写入，小写文件名）
│  ├─ downloads/               可下载的处理后数据与附图 zip（由 sync-data 生成）
│  ├─ sw.js                    Service Worker
│  └─ manifest.webmanifest     PWA 清单
├─ scripts/
│  ├─ smoke.mjs                HTTP 冒烟测试
│  ├─ e2e.mjs                  浏览器端到端测试
│  └─ make-icons.mjs           PWA 图标生成
├─ dataset/                    题库原始资料与处理管线（不属于前端代码）
│  ├─ pdf/                     题库源 PDF（A/B/C 类 + 总题库附图标记）
│  ├─ {A,B,C}.json             由 PDF 生成的题目数据
│  ├─ figures.json / .html     附图清单与总览页
│  └─ tools/
│     ├─ build_dataset.py      PDF -> dataset/*.json + public/figures/
│     ├─ verify_bank.py        PDF <-> JSON 逐字段校验
│     ├─ verify_dataset.py     数据形态自检
│     └─ sync-data.mjs         dataset/*.json -> data/*.json + public/downloads/
└─ docs/WEB.md                 本文件
```

### 数据流

```
dataset/pdf/*.pdf ─► dataset/tools/build_dataset.py ─► dataset/{A,B,C}.json
                                                    ─► dataset/figures.json
                                                    ─► public/figures/*.jpg
                                                               │
dataset/{A,B,C}.json ─► dataset/tools/sync-data.mjs ─► data/{questions,figures,index}.json
dataset/figures.json ────────────────────────────────► public/downloads/*（下载用）
                                                       data/downloads.json（下载清单）
                                                              │
                                        lib/question-bank.ts ◄┘（静态 import，构建期内联）
                                                              │
                         页面/组件 ─► lib/store.ts ─► lib/idb.ts ─► IndexedDB
```

两步都是幂等的。只改前端时不需要 Python 环境 —— `data/` 与 `public/figures/` 已在仓库中。

**设计取舍**

- **题目数据静态内联，不做运行时接口**：题库是只读的，构建时内联后全站数据同源、无请求瀑布、天然可离线。`questions.json` 原始约 1.46 MB，**gzip 后约 321 KB**。
- **进度只在浏览器本地**：用原生 IndexedDB（未引入 `idb`、Dexie 等封装），约 100 行封装 `open/get/getAll/put/putMany/delete/clear`。
- **服务端渲染不碰用户数据**：`useStore` 的服务端快照恒为「未加载」，避免 hydration 不一致；`/browse` 与首页数据卡片是纯服务端渲染，因此禁 JS 也有内容。
- **无重型 UI 依赖**：全部样式基于 Tailwind v4 的 `@theme` 设计令牌 + 少量 `@layer components` 类（`.card` `.btn` `.option` `.chip` 等）。
- **做题位置从 URL 推导**，不在 state 里重复保存，导航只需 `router.replace`，无需 effect 回写 state。
- **附图只存一份**：`build_dataset.py` 直接写入 `public/figures/` 且文件名统一小写，同步脚本只做交叉核对、不再复制，避免两份副本漂移（小写也保证在 Linux 容器 / CDN 等区分大小写的环境上不会 404）。
- **原始 PDF 不放进 `public/`**：改用 `/api/download/bank-pdf` 路由处理器按下发，只暴露 `lib/downloads.ts` 白名单里的 4 个文件，并能精确控制 `Content-Disposition`（中文文件名走 RFC 5987 的 `filename*`），避免把 `dataset/pdf/` 整个目录公开。
- **附图 zip 手写生成**：不引第三方打包库，条目按文件名排序、时间戳固定为 1980-01-01，因此同一份输入必然产出逐字节相同的 zip（已验证两次生成 SHA-256 一致），便于缓存与校验。

### 数据下载

`/downloads` 由服务端渲染，读 `data/downloads.json` 清单（含每个文件的字节数与 SHA-256）：

| 入口 | 内容 |
| --- | --- |
| `/api/download/bank-pdf?id=A\|B\|C\|figures` | 题库原始 PDF（未做任何修改） |
| `/downloads/crac-questions-{A,B,C}.json` | 应用内部形态：camelCase、`options` 为 4 元数组，附 `fieldNotes` |
| `/downloads/crac-dataset-{A,B,C}.json` | 与 `dataset/*.json` 一致：snake_case、选项为对象，含 `validation_notes` |
| `/downloads/crac-figures.json` · `crac-figures.zip` | 附图清单与 53 张图片 |

`dataset/tools/verify_dataset.py` 会校验「`lib/downloads.ts` 与 `sync-data.mjs` 的白名单一致」「下载产物与清单一致」「校验值覆盖全部产物」，防止两处清单漂移或产物缺失。

### 状态与持久化

IndexedDB 数据库 `crac-practice`（v2）含 6 个 object store：

| store | 内容 |
| --- | --- |
| `stats` | 每题累计状态：作答次数、对错数、连续答对、收藏、已掌握 |
| `attempts` | 作答流水（时间、选项、来源），统计与 7 天柱状图的基础 |
| `seq` | 顺序练习断点 |
| `exams` | 考试会话（可刷新恢复） |
| `results` | 考试成绩历史 |
| `settings` | 练习偏好（自动跳题、显示附图、错题移出阈值） |

题目定位键为 `` `${bank}:${index}` ``。**这一点很重要**：A/B/C 三套题库之间有 1143 个共用题号（源题库本身大量重叠），若只用题号做主键，进度会互相覆盖。

---

## 题库数据说明

数据来自 `dataset/`，由 `dataset/tools/build_dataset.py` 从题库 PDF 生成、`dataset/tools/verify_bank.py` 逐字段校验。同步脚本 `dataset/tools/sync-data.mjs` 只做**字段重塑与规范化**（重命名字段、选项数组化），不改动题目内容。

| 题库 | 题数 | 单选 | 多选 | 知识点 | 附图 |
| --- | ---: | ---: | ---: | ---: | ---: |
| A 类 | 683 | 547 | 136 | 51 | 1 |
| B 类 | 1143 | 947 | 196 | 95 | 24 |
| C 类 | 1282 | 1072 | 210 | 104 | 53 |
| **合计** | **3108** | 2566 | 542 | — | 78 处引用 → 53 张图片 |

章节名称按知识点首段归类（1 法律法规与管理制度 / 2 操作规范与通联流程 / 3 电波传播与天线 / 4 电子电路与设备 / 5 安全防护与电磁环境）。

**已知的源数据特征**（应用已妥善处理，非缺陷）：

- `A/B/C` 之间存在 1143 个共用题号，因此进度按「题库 + 序号」记录。
- 源题库中有 596 处总题库编号为占位值 `LX`（A 类 167 / B 类 217 / C 类 212），这是源 PDF 的原貌，已原样保留，未做猜测性填充。
- `MC1-0014`、`MC1-0016` 在源文件中题型前缀为 MC1（单选）但答案有 2 项。应用以**答案个数**判定题型（界面上按多选呈现），并把这 6 条记录标记在 `issues` 字段中以便溯源；界面上不做提示。
- 题目卡的 `issues` 字段会展示源数据自检标记；若某题编号为空则显示「编号缺失」（当前数据集中没有这种情况，属防御性分支）。

数据版本由题目内容的 SHA-256 前 12 位生成（当前 `a052a0c01311`），显示在首页与设置面板，便于确认前端数据与 `dataset/` 是否同源。

---

## 测试

两层测试，均已通过：

**`npm run test:smoke`（25 项）** —— HTTP 层，断言服务端渲染内容：
各路由 200、首页统计数字、浏览页题目/分页/知识点筛选/附图路径、PWA 资源（manifest / sw.js / 三种图标）、**下载入口（下载页、两种 JSON 形态、附图 zip 的文件头魔数、原始 PDF 的 `%PDF` 魔数与 `Content-Disposition`）**、以及题库数据确实进入了客户端 bundle。

> 练习/考试/统计页是客户端组件，首屏 HTML 只有骨架屏，因此冒烟测试对它们只校验「外壳」（200 + 合法 HTML），真实内容由 e2e 覆盖。

**`npm run test:e2e`（45 项）** —— 用本机 Edge（`puppeteer-core`）真实运行：
题目与选项渲染、键盘快捷键（A–D / Enter / ←→ / S）、判分与错题判定、IndexedDB 落盘（attempts / stats）、附图 `naturalWidth > 0`、错题本收录与展开、「逐题重做」链接与页面、切换题库不串进度、统计页渲染、考试组卷→答题→交卷→成绩页、结果页失分知识点、深色模式切换与刷新保持、Service Worker 注册、**断网后练习页与浏览页仍可用**、**禁用 JS 后浏览页仍有内容**、**下载页链接完整性、PDF 实际下载可解析、处理后 JSON 结构正确、非法 id 被白名单拦截**、**题目卡不再显示源数据提示**、全程无控制台错误与 4xx/5xx。

当前结果：`25/25` 与 `45/45` 全部通过，`npm run check`（typecheck + lint + build）无错误无警告。

---

## 部署

仓库根目录就是应用根目录，**无需配置 root directory / 子目录**，任何支持 Node 20.9+ 的平台均可：

```bash
npm ci && npm run build && npm run start
```

- **Vercel**：直接导入仓库即可，Framework Preset 会自动识别为 Next.js，Root Directory 保持默认（仓库根）。
- **Docker / 自建**：`npm ci && npm run build` 后 `npm run start`。
- **静态托管**：本项目用了 Service Worker 与 `next.config.ts` 的 `headers()`，因此走 Node 运行时（`next start`）最稳妥；纯静态导出需自行处理 `/browse` 的 `searchParams` 与缓存头。

`dataset/`（题库 PDF 与 Python 管线）不参与前端构建，也不会被 Next 打包；如需缩小仓库体积可自行删除，应用只依赖 `data/` 与 `public/figures/`。若要在部署时跳过校验 Python 依赖，直接用默认的 `npm ci`（不安装任何 Python 包）。

静态化程度：`/`、`/practice`、`/exam`、`/exam/result`、`/review`、`/stats` 均为预渲染静态页（`○`），仅 `/browse` 因读取 `searchParams` 为按需渲染（`ƒ`）。应用**没有服务端状态与数据库**。

注意：`/figures/*` 与 `/sw.js` 的缓存头已在 `next.config.ts` 中配置（附图 immutable 长缓存，`sw.js` 不缓存）。

---

## 浏览器支持

依赖 IndexedDB、Service Worker、`:has`/`color-mix` 等现代特性，支持 Chrome / Edge / Firefox / Safari 最近两个大版本。存储不可用（隐私模式、配额耗尽）时会给出顶部提示，功能降级为「本次会话有效」。
