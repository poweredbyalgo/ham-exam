import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    // 静态导出产物（npm run build -> dist/），压缩后的 bundle 不参与 lint
    "dist/**",
    "next-env.d.ts",
    // 生成的题库数据（由 dataset/tools/sync-data.mjs 产出，不参与 lint）
    "data/**",
    // 题库原始资料与 Python 管线，不属于前端代码
    "dataset/**",
    "public/sw.js",
  ]),
]);

export default eslintConfig;
