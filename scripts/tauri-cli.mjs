#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const env = { ...process.env };

if (args.includes('dev') && !env.TAURI_DEV_WATCHER_IGNORE_FILE) {
    const ignoreFile = join(repoRoot, '.gitignore');
    if (existsSync(ignoreFile)) {
        env.TAURI_DEV_WATCHER_IGNORE_FILE = ignoreFile;
    }
}

const tauriCli = join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const child = spawn(process.execPath, [tauriCli, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    env,
});

child.on('error', (error) => {
    console.error(error.message);
    process.exit(1);
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.exit(1);
    }
    process.exit(code ?? 0);
});
