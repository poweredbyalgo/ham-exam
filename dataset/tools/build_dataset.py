# -*- coding: utf-8 -*-
"""
从题库 PDF 生成 dataset/ 下的题目数据与附图。

  dataset/<A|B|C>.json        题目数据（属性名全英文/ASCII）
  dataset/figures.json        附图清单
  dataset/figures.html        附图总览页
  public/figures/LKxxxx.jpg   附图文件（Next.js 应用从 public/ 提供静态资源）

管线中本脚本的下游是 dataset/tools/sync-data.mjs，后者把这里的 JSON
重塑成 web 应用直接引用的 data/*.json。

用法：python dataset/tools/build_dataset.py
"""
import pymupdf, re, json, os, collections

# dataset/tools/build_dataset.py -> dataset/tools -> dataset -> 仓库根
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "dataset")
BANK_DIR = os.path.join(OUT, "pdf")          # 题库原始 PDF
IMG_DIR = os.path.join(ROOT, "public", "figures")   # 附图单一来源（应用直接提供）
FIG_PDF = os.path.join(BANK_DIR, "总题库附图标记.pdf")

CJK = r"[\u2E80-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]"
TYPE_CODE_TO_EN = {"MC1": "single_choice", "MC2": "multiple_choice",
                   "MC3": "multiple_choice", "MC4": "multiple_choice"}


def clean(s: str) -> str:
    lines = [l.strip() for l in (s or "").replace("\u00a0", " ").split("\n")]
    out = ""
    for ln in lines:
        if not ln:
            continue
        if not out:
            out = ln
        elif re.search(r"[0-9A-Za-z]$", out) and re.match(r"^[0-9A-Za-z]", ln):
            out += " " + ln
        else:
            out += ln
    out = re.sub(r"\s+", " ", out)
    out = re.sub(r"(" + CJK + r")\s+", r"\1", out)
    out = re.sub(r"\s+(" + CJK + r")", r"\1", out)
    return out.strip()


TAG_RE = re.compile(r"^\[(J|P|I|Q|T|A|B|C|D|F)\](.*)$")
PAGENUM_RE = re.compile(r"^\d{1,4}$")


def page_text(page):
    """按视觉顺序还原一页文本, 并剔除页脚页码。

    C 类题库 PDF 每一页页脚都印有页码(1..309)。若按 pymupdf 默认的
    内容流顺序取文本, 页码会夹杂在标签之间, 被 clean() 粘连进
    question_id / bank_id / answer / 选项 等字段, 形成不属于题库的杂质
    (例如 "MC1-0005 2"、"A206"、"欧（姆）207")。因此这里按行坐标重排,
    并把位于页面底部 10% 的纯数字行(页脚页码)整行丢弃。

    返回 (文本, 被剔除的页码行列表)。
    """
    lines, dropped = [], []
    for blk in page.get_text("dict")["blocks"]:
        if blk.get("type") != 0:
            continue
        for ln in blk.get("lines", []):
            txt = "".join(sp["text"] for sp in ln["spans"])
            r = pymupdf.Rect(ln["bbox"])
            if PAGENUM_RE.match(txt.strip()) and r.y0 > page.rect.height * 0.9:
                dropped.append(txt.strip())
                continue
            lines.append((round(r.y0, 1), r.x0, txt))
    lines.sort(key=lambda z: (z[0], z[1]))
    return "\n".join(t for _, _, t in lines), dropped


def parse_questions(text):
    items, tag, buf = [], None, []
    for raw in text.split("\n"):
        m = TAG_RE.match(raw.rstrip())
        if m:
            if tag:
                items.append((tag, "\n".join(buf)))
            tag, buf = m.group(1), [m.group(2)]
        elif tag is not None:
            buf.append(raw.rstrip())
    if tag:
        items.append((tag, "\n".join(buf)))
    qs, cur = [], None
    for t, txt in items:
        if t == "J":
            if cur:
                qs.append(cur)
            cur = {"J": txt.strip()}
        elif cur is not None:
            cur.setdefault(t, txt)
    if cur:
        qs.append(cur)
    return qs


FIELD_NOTES = {
    "question_id": "源文件 [I] 字段；前缀 MCn 中的 n 表示正确选项个数",
    "bank_id": "源文件 [J] 字段；总题库编号（前缀 LY / LK / LX）",
    "knowledge_point": "源文件 [P] 字段，格式为 章节.小节.条目",
    "type": "按答案实际选项个数判定（1 个为 single_choice，2 个及以上为 multiple_choice）",
    "type_code": "源文件的 MC 前缀，保留以便溯源",
    "answer": "源文件 [T] 字段",
    "figure": "源文件 [F] 字段；文件名对应 public/figures/ 下的图片",
    "issues": "机器可读的异常代码（英文）；对应中文说明见 validation_notes 的 message",
}
CN_TYPE = {"single_choice": "单项选择", "multiple_choice": "多项选择", "unknown": "未知"}
MSG_TYPE_MISMATCH = ("源文件题型代码为{code}（{code_type}），实际答案含{n}项，"
                     "已按{resolved}处理")

def build_questions(raw_text):
    """把解析出的标签块转成题目记录; 返回 (questions, notes)。

    该函数是 JSON 内容的唯一来源, tools/verify_bank.py 复用同一实现,
    以保证「JSON 与题库 PDF 对应」的校验口径与生成口径完全一致。
    """
    questions, notes = [], []
    for i, q in enumerate(parse_questions(raw_text), 1):
        qid = clean(q.get("I", ""))
        m = re.match(r"^([A-Za-z]+\d*)-(.+)$", qid)
        code = m.group(1).upper() if m else ""
        opts = {L: clean(q[L]) for L in "ABCD" if L in q}
        ans = clean(q.get("T", "")).upper().replace(" ", "")
        n = len(ans)
        qtype = "single_choice" if n == 1 else ("multiple_choice" if n > 1 else "unknown")

        issues = []
        expect = TYPE_CODE_TO_EN.get(code)
        if expect and expect != qtype:
            issues.append("type_code_vs_answer_count_mismatch")
            notes.append({"index": i, "question_id": qid,
                          "issue": "type_code_vs_answer_count_mismatch",
                          "message": MSG_TYPE_MISMATCH.format(
                              code=code, code_type=CN_TYPE[expect], n=n,
                              resolved=CN_TYPE[qtype]),
                          "type_code": code,
                          "type_code_implies_options": 1 if code == "MC1" else int(code[-1]),
                          "answer_option_count": n, "resolved_type": qtype})
        if len(opts) != 4:
            issues.append("missing_options")
            notes.append({"index": i, "question_id": qid, "issue": "missing_options",
                          "message": "选项不完整，缺失 "
                                     + "、".join(L for L in "ABCD" if L not in opts),
                          "missing": [L for L in "ABCD" if L not in opts]})
        if not clean(q.get("Q", "")):
            issues.append("empty_stem")
            notes.append({"index": i, "question_id": qid, "issue": "empty_stem",
                          "message": "题干为空"})
        # 杂质自检: 答案里除 A-D 之外不应出现任何字符(页码粘连会在此暴露)
        stray = sorted(set(ans) - set("ABCD"))
        if stray:
            issues.append("answer_contains_non_option_chars")
            notes.append({"index": i, "question_id": qid,
                          "issue": "answer_contains_non_option_chars",
                          "message": "答案含非选项字符 " + "、".join(stray)
                                     + "，疑似源文件杂质",
                          "answer": ans, "stray": stray})
        if not re.fullmatch(r"[A-Za-z]+\d*-\d+", qid):
            issues.append("malformed_question_id")
            notes.append({"index": i, "question_id": qid,
                          "issue": "malformed_question_id",
                          "message": "题号不符合 MCn-数字 格式，疑似源文件杂质"})

        questions.append({
            "index": i,
            "question_id": qid,
            "bank_id": clean(q.get("J", "")),
            "knowledge_point": clean(q.get("P", "")),
            "type": qtype,
            "type_code": code,
            "stem": clean(q.get("Q", "")),
            "options": opts,
            "answer": ans,
            "answer_options": list(ans),
            "figure": clean(q.get("F", "")) or None,
            "issues": issues,
        })
    return questions, notes


summary, all_reports = [], []


def build_category(cat):
    """从 <cat>类题库.pdf 解析并返回 (data, report_row)。"""
    src = os.path.join(BANK_DIR, f"{cat}类题库.pdf")
    doc = pymupdf.open(src)
    pages, footer_pagenums = zip(*(page_text(p) for p in doc))
    raw_text = "\n".join(pages)
    footer_pagenums = [p for grp in footer_pagenums for p in grp]
    embedded = sum(len(p.get_images(full=True)) for p in doc)
    doc.close()

    questions, notes = build_questions(raw_text)

    chap = collections.Counter(q["knowledge_point"].split(".")[0] for q in questions)
    data = {
        "source_file": f"{cat}类题库.pdf",
        "category": cat,
        "total": len(questions),
        "type_counts": dict(collections.Counter(q["type"] for q in questions)),
        "chapter_counts": {k: chap[k] for k in sorted(chap)},
        "knowledge_point_count": len(set(q["knowledge_point"] for q in questions)),
        "embedded_images_in_pdf": embedded,
        "footer_page_numbers_stripped": len(footer_pagenums),
        "figure_references": sum(1 for q in questions if q["figure"]),
        "validation_notes": notes,
        "field_notes": FIELD_NOTES,
        "questions": questions,
    }
    json.dump(data, open(os.path.join(OUT, f"{cat}.json"), "w", encoding="utf-8",
                         newline="\n"),
              ensure_ascii=False, indent=2)
    summary.append((cat, data))
    all_reports.append((cat, len(questions), data["type_counts"], len(notes), embedded,
                        data["figure_references"], len(footer_pagenums)))
    return data

# ---------------- 附图 ----------------
LBL_RE = re.compile(r"LK\d{3,4}")

# 源 PDF 笔误订正: 图上印的是 LK060, 但题库侧引用的是 LK0603.jpg（且序列为 LK0602 -> LK0604）
LABEL_FIX = {"LK060": "LK0603"}


def cluster(rows, key, tol):
    rows = sorted(rows, key=key)
    out, cur = [], []
    for r in rows:
        if cur and abs(key(r) - key(cur[0])) > tol:
            out.append(cur); cur = []
        cur.append(r)
    if cur:
        out.append(cur)
    return out


def build_figures():
    """从 总题库附图标记.pdf 提取附图, 写出 public/figures/ 文件、figures.json、figures.html。"""
    doc = pymupdf.open(FIG_PDF)
    manifest, warns = [], []
    for pno, page in enumerate(doc, 1):
        labels = []
        for blk in page.get_text("dict")["blocks"]:
            if blk.get("type") != 0:
                continue
            for ln in blk.get("lines", []):
                txt = "".join(sp["text"] for sp in ln["spans"]).strip()
                if LBL_RE.fullmatch(txt):
                    labels.append({"t": txt, "r": pymupdf.Rect(ln["bbox"])})
        imgs = [{"x": im["xref"], "r": pymupdf.Rect(im["bbox"])}
                for im in page.get_image_info(xrefs=True)]
        lrows = cluster(labels, lambda z: z["r"].y0, 15)
        irows = cluster(imgs, lambda z: z["r"].y1, 20)
        if len(lrows) != len(irows):
            warns.append(f"page {pno}: row mismatch {len(lrows)}/{len(irows)}")
        for li, (lr, ir) in enumerate(zip(lrows, irows)):
            lr = sorted(lr, key=lambda z: (z["r"].x0 + z["r"].x1) / 2)
            ir = sorted(ir, key=lambda z: (z["r"].x0 + z["r"].x1) / 2)
            if len(lr) != len(ir):
                warns.append(f"page {pno} row {li+1}: count mismatch {len(lr)}/{len(ir)}")
            for lb, im in zip(lr, ir):
                lc = (lb["r"].x0 + lb["r"].x1) / 2
                ic = (im["r"].x0 + im["r"].x1) / 2
                dist = abs(lc - ic)
                if dist / max(im["r"].width, 1) > 0.5:
                    warns.append(f"{lb['t']}: center offset {dist:.1f} too large")
                d = doc.extract_image(im["x"])
                src_label = lb["t"]
                fid = LABEL_FIX.get(src_label, src_label)
                # 文件名统一小写: 应用侧按 "LK0597.JPG" -> "lk0597.jpg" 归一化后请求，
                # 小写文件名可避免在区分大小写的文件系统（Linux 容器/CDN）上 404。
                fn = f"{fid}.jpg".lower()
                open(os.path.join(IMG_DIR, fn), "wb").write(d["image"])
                manifest.append({
                    "figure_id": fid, "file": fn, "page": pno, "xref": im["x"],
                    "width": d["width"], "height": d["height"], "format": d["ext"],
                    "bytes": len(d["image"]), "center_offset": round(dist, 1),
                    "source_label": src_label,
                    "note": (f"图上印的编号为“{src_label}”，经题库侧引用与编号序列核对为笔误，"
                             f"已订正为“{fid}”") if fid != src_label else None,
                })
    doc.close()
    manifest.sort(key=lambda m: m["figure_id"])
    json.dump(manifest, open(os.path.join(OUT, "figures.json"), "w", encoding="utf-8",
                             newline="\n"),
              ensure_ascii=False, indent=2)

    # 总览页（文件名 ASCII 小写，相对路径引用 ../public/figures/）
    cards = []
    for m in manifest:
        cards.append(
            '    <figure class="card">\n'
            f'      <div class="imgbox"><img src="../public/figures/{m["file"]}" alt="{m["figure_id"]}" loading="lazy"></div>\n'
            f'      <figcaption><span class="id">{m["figure_id"]}</span>'
            f'<span class="meta">p{m["page"]} &middot; {m["width"]}x{m["height"]}</span></figcaption>\n'
            '    </figure>')
    html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CRAC figure index</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --line:#e3e6ea; --text:#1f2430; --sub:#6b7280; --accent:#2f6fed; }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 32px 60px; background:var(--bg); color:var(--text);
         font:14px/1.6 "Segoe UI",system-ui,sans-serif; }
  h1 { font-size:21px; margin:0 0 6px; font-weight:650; }
  .sub { color:var(--sub); font-size:13px; margin-bottom:22px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:14px; }
  .card { margin:0; background:var(--card); border:1px solid var(--line); border-radius:10px;
          overflow:hidden; box-shadow:0 1px 2px rgba(16,24,40,.05); }
  .imgbox { height:170px; display:flex; align-items:center; justify-content:center;
            padding:10px; background:#fff; border-bottom:1px solid var(--line); }
  .imgbox img { max-width:100%; max-height:100%; object-fit:contain; }
  figcaption { padding:7px 10px; display:flex; justify-content:space-between; align-items:baseline; gap:6px; }
  .id { font:600 13px/1.4 ui-monospace,Consolas,monospace; color:var(--accent); }
  .meta { font-size:11px; color:var(--sub); white-space:nowrap; }
</style>
</head>
<body>
<h1>CRAC figure index</h1>
<div class="sub">source: 总题库附图标记.pdf &nbsp;&middot;&nbsp; __N__ figures, __RANGE__ &nbsp;&middot;&nbsp; files under public/figures/</div>
<div class="grid">
__CARDS__
</div>
</body>
</html>"""
    html = (html.replace("__N__", str(len(manifest)))
                .replace("__RANGE__", f'{manifest[0]["figure_id"]} - {manifest[-1]["figure_id"]}')
                .replace("__CARDS__", "\n".join(cards)))
    open(os.path.join(OUT, "figures.html"), "w", encoding="utf-8", newline="\n").write(html)
    return manifest, warns


def main():
    # 重建附图目录, 保证不残留上一次构建的图片
    os.makedirs(IMG_DIR, exist_ok=True)
    for f in os.listdir(IMG_DIR):
        os.remove(os.path.join(IMG_DIR, f))

    for cat in ("A", "B", "C"):
        build_category(cat)

    manifest, warns = build_figures()

    # ---------------- 报告 ----------------
    rep = []
    for cat, n, tc, nn, emb, fig, fpn in all_reports:
        rep.append(f"{cat}.json: total={n} types={tc} validation_notes={nn} "
                   f"embedded_images_in_pdf={emb} figure_refs={fig} "
                   f"footer_page_numbers_stripped={fpn}")
    rep.append(f"figures: {len(manifest)} files, ids {manifest[0]['figure_id']}..{manifest[-1]['figure_id']}, "
               f"unique={len(set(m['figure_id'] for m in manifest))}, warnings={warns or 'none'}")
    open(os.path.join(OUT, "_report.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(rep))
    print("\n".join(rep))


if __name__ == "__main__":
    main()
