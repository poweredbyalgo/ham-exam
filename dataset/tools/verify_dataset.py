# -*- coding: utf-8 -*-
"""dataset/ 数据形态自检: JSON 键名与文件名是否全 ASCII、附图引用是否完整、
题型与答案是否自洽。PDF <-> JSON 的对应关系校验见 dataset/tools/verify_bank.py。"""
import json, os, glob, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))   # dataset/tools
OUT = os.path.dirname(HERE)                          # dataset
ROOT = os.path.dirname(OUT)                          # 仓库根
IMG = os.path.join(ROOT, "public", "figures")
rep = []
def P(*a): rep.append(" ".join(str(x) for x in a))

ASCII = re.compile(r"^[\x00-\x7F]+$")

# 1) 所有 JSON 的 key 是否全 ASCII
keys = set()
def walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            keys.add(k); walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)

for p in sorted(glob.glob(os.path.join(OUT, "*.json"))):
    walk(json.load(open(p, encoding="utf-8")))
bad = sorted(k for k in keys if not ASCII.match(k))
P("json keys total:", len(keys), "| non-ASCII keys:", bad if bad else "none")

# 2) 文件名是否全 ASCII
files = [f for f in os.listdir(OUT)] + [f for f in os.listdir(IMG)]
badf = sorted(f for f in files if not ASCII.match(f))
P("dataset files:", len(files), "| non-ASCII filenames:", badf if badf else "none")

# 3) 附图引用完整性: 题目里的 figure 是否都能在 public/figures/ 找到
have = set(f for f in os.listdir(IMG) if f.lower().endswith((".jpg", ".jpeg", ".png")))
have_lower = set(f.lower() for f in have)
for cat in ("A", "B", "C"):
    d = json.load(open(os.path.join(OUT, f"{cat}.json"), encoding="utf-8"))
    refs = [q["figure"] for q in d["questions"] if q["figure"]]
    # 大小写不敏感: 题目保留源文件写法 "LK0597.JPG"，磁盘为 "lk0597.jpg"，
    # 但请求路径在区分大小写的文件系统（Linux 容器/CDN）上必须精确匹配小写文件名。
    missing = sorted(set(r for r in refs if r.lower() not in have_lower))
    P(f"{cat}.json figure_refs={len(refs)} unique={len(set(refs))} missing_files={missing if missing else 'none'}")
    if missing:
        P(f"  ★ 这些引用在 public/figures/ 中找不到对应文件（注意大小写）")

# 4) 未被任何题目引用的图片
allrefs = set()
for cat in ("A", "B", "C"):
    d = json.load(open(os.path.join(OUT, f"{cat}.json"), encoding="utf-8"))
    allrefs |= set(q["figure"] for q in d["questions"] if q["figure"])
allrefs_lower = set(r.lower() for r in allrefs)
P("public/figures files:", len(have), "| referenced by bank:", len(allrefs),
  "| unreferenced:", sorted(f for f in have if f.lower() not in allrefs_lower))

# 4b) figures.json 清单与实际文件必须一一对应（含大小写），
#     否则应用按 file 字段拼出的 URL 会在大小写敏感的文件系统上 404。
man = json.load(open(os.path.join(OUT, "figures.json"), encoding="utf-8"))
man_files = sorted(m["file"] for m in man)
man_ids = sorted(m["figure_id"] + ".jpg" for m in man)
P("figures.json entries:", len(man), "| file 字段与实际文件精确一致:",
  "yes" if man_files == sorted(have) else "NO")
if man_files != sorted(have):
    only_man = sorted(set(man_files) - have)
    only_disk = sorted(have - set(man_files))
    P("  ★ figures.json 有而磁盘无:", only_man or "none")
    P("  ★ 磁盘有而 figures.json 无:", only_disk or "none")
P("figures.json file 字段全小写:", "yes" if all(f == f.lower() for f in man_files) else "NO")
if not all(f == f.lower() for f in man_files):
    P("  ★ 文件名含大写，在区分大小写的文件系统上会导致 404")

# 5) 题型/答案自洽
for cat in ("A", "B", "C"):
    d = json.load(open(os.path.join(OUT, f"{cat}.json"), encoding="utf-8"))
    bad2 = [q["question_id"] for q in d["questions"]
            if (len(q["answer"]) == 1) != (q["type"] == "single_choice")]
    P(f"{cat}.json type/answer consistency: {'OK' if not bad2 else bad2}")

open(os.path.join(OUT, "_verify_dataset.txt"), "w", encoding="utf-8").write("\n".join(rep))
print("\n".join(rep))
