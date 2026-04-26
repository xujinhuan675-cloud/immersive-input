/**
 * gen-icon.mjs
 *
 * 直接将 public/icon.svg 渲染为 1024×1024 PNG，
 * 再用 pnpm tauri icon 生成全平台所需的所有图标格式。
 *
 * 用法：pnpm gen-icon
 * 依赖：@resvg/resvg-js（纯 Rust/WASM SVG 渲染器，无需浏览器）
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── 源文件：产品图标 SVG ──────────────────────────────────────────────────
const svgPath = resolve(ROOT, 'public/icon.svg');
const pngOut  = resolve(ROOT, 'app-icon.png');

console.log(`读取 SVG: ${svgPath}`);
const svgData = readFileSync(svgPath);

// ── SVG → 1024×1024 PNG（Resvg 直接渲染，无需浏览器）────────────────────
console.log('渲染 SVG → 1024×1024 PNG...');
const resvg = new Resvg(svgData, {
    fitTo: { mode: 'width', value: 1024 },
    background: 'white',  // 确保无透明像素，托盘不显示空白图标
});
const pngBuffer = resvg.render().asPng();
writeFileSync(pngOut, pngBuffer);
console.log(`✓ 生成 app-icon.png (${pngBuffer.length} bytes)`);

// ── 运行 tauri icon 生成全平台图标格式 ────────────────────────────────────
console.log('\n正在生成全平台图标格式...');
execSync(`pnpm tauri icon "${pngOut}"`, { stdio: 'inherit', cwd: ROOT });

// ── public 图标同步（应用内 UI / Updater / 邮件资源）───────────────────────
copyFileSync(resolve(ROOT, 'src-tauri/icons/128x128.png'), resolve(ROOT, 'public/icon.png'));
copyFileSync(pngOut, resolve(ROOT, 'public/app-icon.png'));
console.log('✓ public/icon.png 已同步');
console.log('✓ public/app-icon.png 已同步');

console.log('\n✅ 图标生成完成！');
console.log('   src-tauri/icons/  — 托盘 / 任务栏 / exe 图标');
console.log('   public/icon.svg   — 应用内 UI（侧边栏、关于页、登录窗口）');
console.log('   public/icon.png   — Updater 窗口');
console.log('   public/app-icon.png — 应用官网/邮件模板');
console.log('\n   重新运行 pnpm tauri dev 即可应用新图标。');
