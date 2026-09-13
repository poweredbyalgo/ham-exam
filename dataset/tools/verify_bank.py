# -*- coding: utf-8 -*-
"""校验 dataset/<A|B|C>.json 与 dataset/pdf/* 题库 PDF 的对应关系。

比对口径与生成口径完全一致: 直接复用 build_dataset 的 page_text() 与
build_questions(), 从题库 PDF 重建题目记录, 再与 JSON 逐题逐字段比对。
任何差异都说明 JSON 与题库 PDF 不一致(即 JSON 中混入了不属于题库的内容)。

检查项:
  1. 题目总数 / 顺序 / index 一致
  2. question_id、bank_id、knowledge_point、type、type_code、stem、
     options、answer、answer_options、figure 全字段一致
  3. 题号严格符合 MCn-数字 (页码等杂质会在此暴露)
  4. 答案仅含 A-D 且非空; 选项 A-D 齐全; 题干与总题库编号非空
  5. 题型与答案个数自洽; type_counts / figure_references 与题目一致
  6. 跨库同一 question_id 内容一致(忽略排版空白差异)
  7. 附图: JSON 引用 -> public/figures/ 文件存在; 无孤立文件;
     figures.json 与附图目录一致
用法: python dataset/tools/verify_bank.py   (退出码 0 通过 / 1 发现问题)
"""
import json, os, re, sys, collections

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))          # dataset/tools
OUT = os.path.dirname(HERE)                                # dataset
ROOT = os.path.dirname(OUT)                                # 仓库根
sys.path.insert(0, HERE)
PDFDIR = os.path.join(OUT, "pdf")
IMG_DIR = os.path.join(ROOT, "public", "figures")

import pymupdf
from build_dataset import page_text, build_questions

QID_RE = re.compile(r"^[A-Za-z]+\d*-\d+$")

FIELDS = ("index", "question_id", "bank_id", "knowledge_point", "type", "type_code",
          "stem", "options", "answer", "answer_options", "figure")

lines, problems = [], []


def P(msg=""):
    lines.append(msg)
    print(msg)


def norm(s):
    """用于跨库比对的宽松归一: 忽略排版空白差异。"""
    return re.sub(r"\s+", "", s)


def expected_records(cat):
    doc = pymupdf.open(os.path.join(PDFDIR, f"{cat}类题库.pdf"))
    pages, dropped = zip(*(page_text(p) for p in doc))
    n_pages = len(pages)
    doc.close()
    questions, notes = build_questions("\n".join(pages))
    return questions, notes, n_pages, sum(len(d) for d in dropped)


P("=" * 74)
P("CRAC 题库 PDF <-> dataset JSON 对应关系校验")
P("=" * 74)

banks = {}
for cat in ("A", "B", "C"):
    d = json.load(open(os.path.join(OUT, f"{cat}.json"), encoding="utf-8"))
    banks[cat] = d
    exp, notes, n_pages, n_dropped = expected_records(cat)
    got = d["questions"]
    P()
    P(f"[{cat}] {d['source_file']}  pages={n_pages}  "
      f"footer_page_numbers_stripped={n_dropped}")

    counts_ok = len(exp) == len(got) == d["total"]
    P(f"    PDF 解析题目={len(exp)}   JSON 题目={len(got)}   json.total={d['total']}"
      f"   {'一致' if counts_ok else '★不一致★'}")
    if not counts_ok:
        problems.append(f"{cat}: 题目数量不一致 PDF={len(exp)} JSON={len(got)} total={d['total']}")

    diffs = [(e["index"], e["question_id"], k, e[k], g.get(k))
             for e, g in zip(exp, got) for k in FIELDS if e[k] != g.get(k)]
    P(f"    逐字段比对: {'全部一致' if not diffs else '★' + str(len(diffs)) + ' 处不一致★'}")
    for idx, qid, k, ev, gv in diffs[:15]:
        P(f"      idx={idx} {qid} 字段 {k}: PDF={ev!r} JSON={gv!r}")
        problems.append(f"{cat}: idx={idx} 字段 {k} 与 PDF 不一致")

    def report(label, bad, is_problem=True):
        P(f"    {label}: {bad if bad else '无'}")
        if bad and is_problem:
            problems.extend(f"{cat}: {label} {x}" for x in bad)

    report("题号格式异常", [q["question_id"] for q in got if not QID_RE.match(q["question_id"])])
    # 页码污染无需再单独扫描: 上面的逐字段比对以 PDF 为准, 任何混入字段的
    # 页码(如 "MC1-0005 2"、"A206"、"欧（姆）207")都会在这里报为不一致。
    # 构建脚本另有 issues 自检 (malformed_question_id / answer_contains_non_option_chars)。
    report("答案非 A-D 或为空",
           [f"idx={q['index']} answer={q['answer']!r}" for q in got
            if not q["answer"] or set(q["answer"]) - set("ABCD")])
    report("选项不完整",
           [f"idx={q['index']}={''.join(sorted(q['options']))}" for q in got
            if sorted(q["options"]) != ["A", "B", "C", "D"]])
    report("题干或总题库编号为空",
           [q["index"] for q in got if not q["stem"].strip() or not q["bank_id"].strip()])
    report("题型与答案个数不自洽",
           [q["index"] for q in got
            if (len(q["answer"]) == 1) != (q["type"] == "single_choice")])

    tc = dict(collections.Counter(q["type"] for q in got))
    tc_ok = tc == d["type_counts"]
    P(f"    type_counts: {tc} {'(与元数据一致)' if tc_ok else '★与元数据不一致★'}")
    if not tc_ok:
        problems.append(f"{cat}: type_counts 与题目不一致")
    figref = sum(1 for q in got if q["figure"])
    fig_ok = figref == d["figure_references"]
    P(f"    figure_references={figref} {'(与元数据一致)' if fig_ok else '★与元数据不一致★'}")
    if not fig_ok:
        problems.append(f"{cat}: figure_references 与题目不一致")

# ---------- 跨库一致性 ----------
P()
P("-" * 74)
P("跨库一致性 (A/B/C 共用题目)")
bysig = collections.defaultdict(list)
for cat in ("A", "B", "C"):
    for q in banks[cat]["questions"]:
        sig = (q["bank_id"], q["knowledge_point"], norm(q["stem"]),
               tuple(sorted((L, norm(v)) for L, v in q["options"].items())),
               q["answer"], (q["figure"] or "").upper(), q["type"])
        bysig[sig].append((cat, q["question_id"]))
byqid = collections.defaultdict(set)
for sig, items in bysig.items():
    for cat, qid in items:
        byqid[qid].add(sig)
shared = [qid for qid, sigs in byqid.items() if len(sigs) > 1]
P(f"同一 question_id 内容不一致的题号: {shared if shared else '无'}")
problems += [f"跨库同题号内容不一致 {x}" for x in shared]

dup_multi = len([q for q, sigs in byqid.items() if len(sigs) == 1
                 and sum(1 for c in ("A", "B", "C") for qq in banks[c]["questions"]
                         if qq["question_id"] == q) > 1])
P(f"多库共用的题号: {dup_multi} 个 (内容一致; 三套题库本身有大量重叠题, 非错误)")

# ---------- 附图 ----------
P()
P("-" * 74)
P("附图核对 (dataset/pdf/总题库附图标记.pdf -> public/figures/*.jpg)")
have = {f.lower(): f for f in os.listdir(IMG_DIR) if f.lower().endswith((".jpg", ".jpeg", ".png"))}
refs = collections.defaultdict(list)
for cat in ("A", "B", "C"):
    for q in banks[cat]["questions"]:
        if q["figure"]:
            refs[q["figure"].lower()].append((cat, q["index"], q["question_id"]))
missing = sorted(r for r in refs if r not in have)
orphan = sorted(set(have) - set(refs))
P(f"public/figures/ 文件数={len(have)}  被题目引用={len(refs)}")
P(f"    题目引用了不存在的附图: {missing if missing else '无'}")
P(f"    public/figures/ 中无题目引用的孤立文件: {[have[o] for o in orphan] if orphan else '无'}")
problems += [f"缺少附图文件 {r}" for r in missing]
problems += [f"孤立附图文件 {have[o]}" for o in orphan]

man = json.load(open(os.path.join(OUT, "figures.json"), encoding="utf-8"))
man_files = sorted({m["file"].lower() for m in man})
# figure_id 规范化为去掉扩展名的编号, 以便与题目 [F] 字段比较
man_ids = sorted({os.path.splitext(m["figure_id"])[0].lower() for m in man})
bad_map = [m for m in man if f"{os.path.splitext(m['figure_id'])[0]}.jpg".lower() != m["file"].lower()]
P(f"    figures.json 条目={len(man)}  figure_id 与文件名一一对应: "
  f"{'是' if not bad_map else '★否★ ' + str([(m['figure_id'], m['file']) for m in bad_map])}")
P(f"    figures.json 文件集合 == public/figures/ 目录: "
  f"{'是' if man_files == sorted(have) else '★否★'}")
if bad_map:
    problems.append("figures.json 中 figure_id 与 file 不匹配")
if man_files != sorted(have):
    problems.append("figures.json 与 public/figures/ 目录不一致")

fig_ids = {os.path.splitext(m["figure_id"])[0].lower() for m in man}
ref_ids = {os.path.splitext(r)[0].lower() for r in refs}
unused_in_pdf = sorted(fig_ids - ref_ids)
P(f"    附图标记 PDF 中未被 A/B/C 题库引用的图: {len(unused_in_pdf)} 个 "
  f"(源文件本身如此, 非错误)")
P(f"    题目引用但附图标记 PDF 中不存在的编号: "
  f"{sorted(ref_ids - fig_ids) if ref_ids - fig_ids else '无'}")
if ref_ids - fig_ids:
    problems.append(f"题目引用了附图标记 PDF 中不存在的编号 {sorted(ref_ids - fig_ids)}")

# ---------- 结论 ----------
P()
P("=" * 74)
if problems:
    P(f"结论: 发现 {len(problems)} 个问题")
    for p in problems:
        P("  - " + p)
else:
    P("结论: dataset/*.json 与题库 PDF 完全对应, 未发现不属于题库的多余内容。")
P("=" * 74)

open(os.path.join(OUT, "_verify.txt"), "w", encoding="utf-8").write("\n".join(lines))
sys.exit(1 if problems else 0)
