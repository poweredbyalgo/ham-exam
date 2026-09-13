/**
 * 题库原始 PDF 白名单 —— 下载入口的唯一事实来源。
 *
 * `dataset/tools/sync-data.mjs` 里有一份内容相同的 JS 副本（该脚本是 ESM，
 * 且需要能在没有 TS 工具链的情况下独立运行），两处必须保持一致。
 * `dataset/tools/verify_dataset.py` 会校验两份清单一致，防止漂移。
 */
export interface BankPdfEntry {
  /** URL 参数 `?id=` 的取值 */
  id: string;
  /** dataset/pdf/ 下的真实文件名 */
  file: string;
  /** 界面上展示的名称 */
  label: string;
}

export const BANK_PDFS: BankPdfEntry[] = [
  { id: "A", file: "A类题库.pdf", label: "A 类题库（原始 PDF）" },
  { id: "B", file: "B类题库.pdf", label: "B 类题库（原始 PDF）" },
  { id: "C", file: "C类题库.pdf", label: "C 类题库（原始 PDF）" },
  {
    id: "figures",
    file: "总题库附图标记.pdf",
    label: "总题库附图标记（原始 PDF）",
  },
];
