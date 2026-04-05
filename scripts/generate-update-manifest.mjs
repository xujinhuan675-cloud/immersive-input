#!/usr/bin/env node

/**
 * 自动生成 Tauri 更新清单文件 (latest.json)
 * 
 * 使用方法：
 * 1. 构建完成后运行: node scripts/generate-update-manifest.mjs
 * 2. 将生成的 latest.json 上传到 GitHub Releases
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取 tauri.conf.json 获取版本号
const tauriConfigPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf-8'));
const version = tauriConfig.package.version;

// GitHub 仓库信息（需要修改为你的仓库）
const GITHUB_REPO = '你的用户名/Immersive-Input';
const RELEASE_TAG = `v${version}`;

// 构建产物目录
const bundleDir = path.join(__dirname, '../src-tauri/target/release/bundle');

// 查找签名文件
function findSignatureFile(platform) {
  const patterns = {
    'windows-x86_64': ['msi', 'nsis'],
    'darwin-x86_64': ['macos', 'dmg'],
    'darwin-aarch64': ['macos', 'dmg'],
    'linux-x86_64': ['appimage', 'deb']
  };

  const dirs = patterns[platform] || [];
  
  for (const dir of dirs) {
    const dirPath = path.join(bundleDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath);
    const sigFile = files.find(f => f.endsWith('.sig'));
    
    if (sigFile) {
      const sigPath = path.join(dirPath, sigFile);
      return fs.readFileSync(sigPath, 'utf-8').trim();
    }
  }
  
  return '';
}

// 生成下载 URL
function generateDownloadUrl(platform) {
  const baseUrl = `https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_TAG}`;
  
  const fileNames = {
    'windows-x86_64': `Immersive-Input_${version}_x64_en-US.msi`,
    'darwin-x86_64': `Immersive-Input_${version}_x64.dmg`,
    'darwin-aarch64': `Immersive-Input_${version}_aarch64.dmg`,
    'linux-x86_64': `immersive-input_${version}_amd64.AppImage`
  };

  return `${baseUrl}/${fileNames[platform]}`;
}

// 生成更新清单
const manifest = {
  version: version,
  notes: `Release v${version}`,
  pub_date: new Date().toISOString(),
  platforms: {}
};

// 支持的平台
const platforms = [
  'windows-x86_64',
  'darwin-x86_64',
  'darwin-aarch64',
  'linux-x86_64'
];

// 为每个平台生成配置
for (const platform of platforms) {
  const signature = findSignatureFile(platform);
  
  if (signature) {
    manifest.platforms[platform] = {
      signature: signature,
      url: generateDownloadUrl(platform)
    };
    console.log(`✓ 找到 ${platform} 的签名文件`);
  } else {
    console.log(`✗ 未找到 ${platform} 的签名文件，跳过`);
  }
}

// 保存到文件
const outputPath = path.join(__dirname, '../latest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

console.log('\n✓ 更新清单已生成:', outputPath);
console.log('\n请执行以下步骤：');
console.log('1. 检查 latest.json 内容是否正确');
console.log('2. 修改 GITHUB_REPO 为你的实际仓库地址');
console.log(`3. 创建 GitHub Release: ${RELEASE_TAG}`);
console.log('4. 上传 latest.json 和所有安装包到 Release');
