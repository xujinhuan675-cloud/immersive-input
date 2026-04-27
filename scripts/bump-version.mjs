#!/usr/bin/env node

import { bumpSemver, readPackageVersion, syncVersionFiles, writePackageVersion } from './version-tools.mjs';

const releaseType = process.argv[2] || 'patch';
const currentVersion = readPackageVersion();
const nextVersion = bumpSemver(currentVersion, releaseType);

writePackageVersion(nextVersion);
syncVersionFiles(nextVersion);

console.log(`Bumped version ${currentVersion} -> ${nextVersion}`);
