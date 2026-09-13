# CRAC 业余无线电智能练习系统

面向中国业余无线电**操作技术能力验证**（A / B / C 类）的刷题系统，附带一套从题库 PDF 到应用数据的完整、可复现管线。

**仓库根目录就是 Next.js 应用根目录** —— 可直接作为 GitHub 仓库导入 Vercel 部署，无需配置子目录。

- **3108 道题**（1375 个唯一题号）· 单选 2566 / 多选 542
- **53 张**电路与天线附图，78 处题目引用
- 进度全部保存在浏览器本地（IndexedDB）：**无需注册、无后端、可离线**

技术栈：Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 · 原生 IndexedDB · PWA

---

## 快速开始

```bash
npm install
npm run dev          # http://localhost:3000
```

生产运行：

```bash
npm run build
npm run start
```

> 只跑应用不需要 Python 环境 —— 题库数据（`data/`）与附图（`public/figures/`）已随仓库提供。

---

## 功能

| 模块 | 能力 |
| --- | --- |
| **顺序练习** | 按题库顺序或指定章节 / 知识点逐题作答，自动记录断点续做 |
| **背题模式** | 题干与答案同屏，可切换「全部选项 / 只看答案」并记住选择，考前快速过题，不计入正确率 |
| **选项乱序** | 可打乱 A–D 显示顺序（顺序按题号固定，答案与已作答记录不会错位） |
| **模拟考试** | 带种子的随机组卷、可配题量/限时/及格线、限时自动交卷、失分知识点分布、逐题复盘 |
| **错题本** | 自动收录错题，连续答对 N 次自动移出（N 可配），支持手动标记已掌握 |
| **收藏夹** | 标记重点题并单独练习 |
| **统计面板** | 总正确率、已作答去重数、连续练习天数、7 天作答图、章节掌握度、知识点明细（可只看薄弱项） |
| **题库浏览** | 服务端渲染的完整题库列表，禁用 JavaScript 也能使用 |
| **数据下载** | 下载题库原始 PDF、处理后的题目 JSON（两种字段形态）与附图图片包，附 SHA-256 校验值 |
| **附图** | 电路图 / 天线图内联渲染，点击放大 |
| **键盘操作** | `A`–`D` 选择、`Enter` 提交/下一题、`←` `→` 翻题、`S` 收藏、`Esc` 关闭图片 |
| **移动端友好** | 「上一题 · 提交 · 下一题」固定在屏幕底部（贴在标签栏之上），题干再长也不用拖着找按钮 |
| **深色模式** | 跟随系统 / 浅色 / 深色三态，无闪白，偏好持久化 |
| **PWA / 离线** | 可安装到桌面，首次访问后断网仍可练习 |
| **数据管理** | 进度导出为 JSON 备份、导入恢复、一键清空 |

---

## 目录结构

仓库根目录即应用根目录，题库原始资料与处理管线收在 `dataset/` 下：

```text
.
├─ app/                 Next.js App Router（页面与客户端组件）
│  ├─ api/download/     原始题库 PDF 白名单下载接口
│  └─ downloads/        数据下载页
├─ components/          复用 UI 组件
├─ lib/                 题库访问层、状态层、IndexedDB 封装、类型
├─ data/                【生成】应用直接引用的静态数据
├─ public/
│  ├─ figures/          【生成】53 张附图
│  ├─ downloads/        【生成】可下载的处理后数据与图片包
│  ├─ sw.js             Service Worker
│  └─ manifest.webmanifest
├─ scripts/             测试与图标生成脚本
├─ dataset/             题库原始资料与处理管线
│  ├─ pdf/              题库源 PDF（A/B/C 类 + 总题库附图标记）
│  ├─ {A,B,C}.json      【生成】题目数据
│  ├─ figures.json/.html【生成】附图清单与总览页
│  └─ tools/
│     ├─ build_dataset.py    PDF → dataset/*.json + public/figures/
│     ├─ verify_bank.py      PDF ↔ JSON 逐字段一致性校验
│     ├─ verify_dataset.py   数据形态自检
│     └─ sync-data.mjs       dataset/*.json → data/*.json + public/downloads/
└─ docs/WEB.md          应用架构与实现细节
```

### 数据流

```text
dataset/pdf/*.pdf ─► build_dataset.py ─► dataset/{A,B,C}.json ─► sync-data.mjs ─► data/questions.json
                                      ─► dataset/figures.json  ─────────────────► data/figures.json
                                      ─► public/figures/*.jpg                      data/index.json
                                                                                        │
                                                              lib/question-bank.ts ◄────┘
                                                                        │
                                            页面 ─► lib/store.ts ─► lib/idb.ts ─► IndexedDB（本地进度）
```

两步都是幂等的：`npm run dataset:build` 重建题库数据，`npm run sync-data` 重塑为应用数据。

---

## 命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` / `npm run start` | 生产构建 / 运行 |
| `npm run check` | typecheck + lint + build |
| `npm run test:smoke` | HTTP 层冒烟测试（25 项） |
| `npm run test:e2e` | 真实浏览器端到端测试（63 项，需本机 Edge/Chrome） |
| `npm run sync-data` | `dataset/*.json` → `data/*.json` |
| `npm run dataset:build` | 题库 PDF → `dataset/*.json` + `public/figures/`（需 Python + pymupdf） |
| `npm run dataset:verify` | 校验题目数据与题库 PDF 逐字段一致 |
| `npm run make-icons` | 重新生成 PWA 图标 |

测试脚本可指定地址：`node scripts/e2e.mjs http://localhost:3210`。

---

## 题库数据

| 题库 | 题数 | 单选 | 多选 | 知识点 | 附图 |
| --- | ---: | ---: | ---: | ---: | ---: |
| A 类 | 683 | 547 | 136 | 51 | 1 |
| B 类 | 1143 | 947 | 196 | 95 | 24 |
| C 类 | 1282 | 1072 | 210 | 104 | 53 |
| **合计** | **3108** | 2566 | 542 | — | 78 → 53 张 |

数据由 `dataset/tools/build_dataset.py` 从题库 PDF 生成，`dataset/tools/verify_bank.py` 逐字段校验（校验结论：三套题库与源 PDF **完全对应，无多余内容**）。

### 下载入口

应用内 `/downloads` 页提供全部数据的下载，也可直接访问：

| 内容 | 入口 |
| --- | --- |
| 题库原始 PDF（4 个，未做任何修改） | `/api/download/bank-pdf?id=A` · `?id=B` · `?id=C` · `?id=figures` |
| 处理后题目 JSON（camelCase，选项为数组） | `/downloads/crac-questions-{A,B,C}.json` |
| 处理后题目 JSON（与 `dataset/` 校验数据一致） | `/downloads/crac-dataset-{A,B,C}.json` |
| 附图清单 / 附图图片包 | `/downloads/crac-figures.json` · `/downloads/crac-figures.zip` |

下载页同时列出每个文件的 SHA-256，可用于校验完整性。PDF 接口只暴露白名单内的 4 个文件（见 `lib/downloads.ts`），不会开放整个 `dataset/` 目录。

**已知的源数据特征**（已妥善处理，非缺陷）：

- 三套题库间有 1143 个共用题号（源题库本身大量重叠），因此进度按「题库 + 序号」而非题号记录。
- 596 处总题库编号为占位值 `LX`（A 167 / B 217 / C 212），为源 PDF 原貌，未做猜测性填充。
- `MC1-0014`、`MC1-0016` 题型前缀为 MC1（单选）但答案有 2 项；应用以**答案个数**判定题型（界面上按多选呈现，不额外提示）。
- 多选需**选全**所有正确选项才算答对（与源题库规则一致）。

数据版本由题目内容的 SHA-256 前 12 位生成（当前 `a052a0c01311`），显示在首页与设置面板，用于确认前端数据与 `dataset/` 同源。

---

## 部署

仓库根目录即应用根目录，直接导入即可：

- **Vercel**：导入仓库 → Framework Preset 自动识别为 Next.js → Root Directory 保持默认 → Deploy。
- **Docker / 自建**：`npm ci && npm run build && npm run start`。
- 应用**没有服务端状态与数据库**；除 `/browse`（读取 `searchParams`）外均为预渲染静态页。

`dataset/` 不参与前端构建也不会被 Next 打包，如需缩小仓库体积可安全删除（应用只依赖 `data/` 与 `public/figures/`）。

---

## 测试

均通过：

- **`npm run test:smoke`（25/25）**：路由与资源可访问、服务端渲染内容、PWA 资源、下载入口文件有效性、题库数据确实进入客户端 bundle。
- **`npm run test:e2e`（63/63）**：用本机 Edge 真实运行 —— 键盘答题、判分、IndexedDB 落盘、附图渲染、错题本、考试全流程、深色模式、Service Worker、断网可用、禁用 JS 降级、下载页与 PDF 下载、底部操作条在手机视口内的可用性、选项乱序的顺序稳定性与判分正确性、背题模式切换与记忆、无控制台错误与 4xx/5xx。
- **`npm run check`**：typecheck + lint + build 无错误无警告。

---

## 文档

- [`docs/WEB.md`](docs/WEB.md) —— 应用架构、数据流、IndexedDB 结构、设计取舍与测试细节。

---

## 说明

本项目的题库数据来自随仓库提供的题库 PDF。题目内容版权归原作者/发布机构所有，本项目仅用于个人学习与技术演示。
