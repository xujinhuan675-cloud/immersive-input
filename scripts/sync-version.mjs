#!/usr/bin/env node

import { readPackageVersion, syncVersionFiles } from './version-tools.mjs';

const version = readPackageVersion();
const result = syncVersionFiles(version);

console.log(`Synced version ${result.version} to ${result.files.join(', ')}`);
