import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json');
const TAURI_CONF_PATH = path.join(__dirname, '../src-tauri/tauri.conf.json');
const CARGO_TOML_PATH = path.join(__dirname, '../src-tauri/Cargo.toml');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 4)}\n`);
}

export function isSemver(version) {
    return /^\d+\.\d+\.\d+$/.test(version);
}

export function readPackageVersion() {
    return readJson(PACKAGE_JSON_PATH).version;
}

export function writePackageVersion(version) {
    if (!isSemver(version)) {
        throw new Error(`Invalid version: ${version}`);
    }

    const packageJson = readJson(PACKAGE_JSON_PATH);
    packageJson.version = version;
    writeJson(PACKAGE_JSON_PATH, packageJson);
}

export function syncVersionFiles(version = readPackageVersion()) {
    if (!isSemver(version)) {
        throw new Error(`Invalid version: ${version}`);
    }

    const tauriConfig = readJson(TAURI_CONF_PATH);
    tauriConfig.package.version = version;
    writeJson(TAURI_CONF_PATH, tauriConfig);

    const cargoToml = fs.readFileSync(CARGO_TOML_PATH, 'utf8');
    const packageSectionMatch = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"(\d+\.\d+\.\d+)"$/m);
    if (!packageSectionMatch) {
        throw new Error('Failed to sync version in src-tauri/Cargo.toml');
    }

    const currentCargoVersion = packageSectionMatch[1];
    const nextCargoToml =
        currentCargoVersion === version
            ? cargoToml
            : cargoToml.replace(
                  /^version\s*=\s*"\d+\.\d+\.\d+"$/m,
                  `version = "${version}"`
              );

    fs.writeFileSync(CARGO_TOML_PATH, nextCargoToml);

    return {
        version,
        files: ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml'],
    };
}

export function bumpSemver(currentVersion, releaseType = 'patch') {
    if (!isSemver(currentVersion)) {
        throw new Error(`Invalid version: ${currentVersion}`);
    }

    const [major, minor, patch] = currentVersion.split('.').map(Number);

    if (releaseType === 'major') {
        return `${major + 1}.0.0`;
    }

    if (releaseType === 'minor') {
        return `${major}.${minor + 1}.0`;
    }

    if (releaseType === 'patch') {
        return `${major}.${minor}.${patch + 1}`;
    }

    if (isSemver(releaseType)) {
        return releaseType;
    }

    throw new Error(`Unsupported release type: ${releaseType}`);
}
