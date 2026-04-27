#!/usr/bin/env node

import fs from 'fs';

import {
    getPackageVersion,
    getReleaseTag,
    getRepository,
    latestDownloadUrl,
    macDmgName,
    windowsInstallerName,
} from './release-assets.mjs';

const version = process.env.APP_VERSION || getPackageVersion();
const repository = getRepository();
const releaseTag = getReleaseTag(version);

const manifest = {
    version,
    notes: `Flow Input ${version}`,
    body: `Flow Input ${version}`,
    pub_date: new Date().toISOString(),
    release_tag: releaseTag,
    repository,
    downloads: {
        windows_x64: latestDownloadUrl(repository, windowsInstallerName(version, 'x64')),
        macos_x64: latestDownloadUrl(repository, macDmgName(version, 'x64')),
        macos_aarch64: latestDownloadUrl(repository, macDmgName(version, 'aarch64')),
    },
};

fs.writeFileSync('./latest.json', JSON.stringify(manifest, null, 2));

console.log(`Generated latest.json for ${repository} @ ${releaseTag}`);
