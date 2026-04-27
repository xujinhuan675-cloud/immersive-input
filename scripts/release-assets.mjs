import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_REPOSITORY = 'xujinhuan675-cloud/immersive-input';
export const APP_SLUG = 'flow-input';

export function getPackageVersion() {
    const packageJsonPath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
}

export function getRepository() {
    return process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
}

export function getReleaseTag(version = getPackageVersion()) {
    return process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || version;
}

export function releaseDownloadUrl(repository, releaseTag, fileName) {
    return `https://github.com/${repository}/releases/download/${releaseTag}/${fileName}`;
}

export function latestDownloadUrl(repository, fileName) {
    return `https://github.com/${repository}/releases/latest/download/${fileName}`;
}

export function getMacAssetArch(target) {
    return target === 'aarch64-apple-darwin' ? 'aarch64' : 'x64';
}

export function getWindowsAssetArch(target) {
    if (target === 'x86_64-pc-windows-msvc') return 'x64';
    if (target === 'i686-pc-windows-msvc') return 'x86';
    return 'arm64';
}

export function macUpdaterBundleName(version, arch) {
    return `${APP_SLUG}_${version}_${arch}.app.tar.gz`;
}

export function macDmgName(version, arch) {
    return `${APP_SLUG}_${version}_${arch}.dmg`;
}

export function windowsInstallerName(version, arch) {
    return `${APP_SLUG}_${version}_${arch}.msi`;
}

export function windowsUpdaterBundleName(version, arch) {
    return `${APP_SLUG}_${version}_${arch}.msi.zip`;
}

export function windowsFixRuntimeInstallerName(version, arch) {
    return `${APP_SLUG}_${version}_${arch}_fix_webview2_runtime.msi`;
}

export function windowsFixRuntimeUpdaterBundleName(version, arch) {
    return `${APP_SLUG}_${version}_${arch}_fix_webview2_runtime.msi.zip`;
}
