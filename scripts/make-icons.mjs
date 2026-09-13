#!/usr/bin/env node
/**
 * 生成 PWA 用的 PNG 图标（192 / 512），供 manifest 的 raster 图标位使用。
 *
 *   node scripts/make-icons.mjs
 *
 * 不引入图形库：手写 PNG 编码（zlib deflate + CRC32），
 * 直接按 icon.svg 的构图绘制渐变圆角底 + 无线电波 + 电台符号。
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

// ---------------------------------------------------------------- PNG 编码

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgba: Buffer，长度 = w*h*4 */
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 每行前加 filter byte 0
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 绘制

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** 有符号距离：圆角矩形 */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** 有符号距离：线段 */
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const t = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * t, pay - bay * t);
}

/** 抗锯齿覆盖率：距离 d < 0 为内部，边缘 1px 过渡 */
function coverage(d, aa) {
  return clamp01(0.5 - d / aa);
}

function draw(size) {
  const S = size;
  const u = S / 512; // 设计稿按 512 绘制，按比例缩放
  const rgba = Buffer.alloc(S * S * 4);

  // 圆角矩形底：左上加下右渐变 (#4a86ff -> #2454c4)
  const radius = 112 * u;
  const wave = { width: 20 * u, faintWidth: 18 * u };

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      // 采样点取像素中心
      const px = x + 0.5;
      const py = y + 0.5;

      // 背景
      const dBg = sdRoundRect(px, py, S / 2, S / 2, S / 2, S / 2, radius);
      const aBg = coverage(dBg, 1.2);
      const t = clamp01((px / S) * 0.5 + (py / S) * 0.5);
      let r = lerp(0x4a, 0x24, t);
      let g = lerp(0x86, 0x54, t);
      let b = lerp(0xff, 0xc4, t);
      let a = aBg;

      if (aBg > 0) {
        // 白色前景元素（叠加淡色以减少锯齿）
        let fg = 0;

        // 中心实心圆 r=30
        fg = Math.max(
          fg,
          coverage(Math.hypot(px - 256 * u, py - 256 * u) - 30 * u, 1.2),
        );

        // 矩形机身
        fg = Math.max(
          fg,
          coverage(sdRoundRect(px, py, 256 * u, 318 * u, 20 * u, 26 * u, 10 * u), 1.2),
        );
        // 底座
        fg = Math.max(
          fg,
          coverage(sdRoundRect(px, py, 256 * u, 363 * u, 60 * u, 11 * u, 11 * u), 1.2),
        );

        // 内侧电波弧线
        const arcs = [
          [152, 214, 152, 298, wave.width, 1],
          [360, 214, 360, 298, wave.width, 1],
          // 外侧淡弧（用较低不透明度近似）
          [108, 176, 108, 336, wave.faintWidth, 0.55],
          [404, 176, 404, 336, wave.faintWidth, 0.55],
        ];
        for (const [ax, ay, bx, by, width, alpha] of arcs) {
          const d = sdSegment(px, py, ax * u, ay * u, bx * u, by * u) - width * u * 0.5;
          fg = Math.max(fg, coverage(d, 1.2) * alpha);
        }

        r = lerp(r, 255, fg);
        g = lerp(g, 255, fg);
        b = lerp(b, 255, fg);
      }

      const i = (y * S + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(a * 255);
    }
  }

  return encodePng(S, S, rgba);
}

for (const size of [192, 512]) {
  const png = draw(size);
  const file = path.join(OUT, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`生成 ${path.relative(process.cwd(), file)}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
