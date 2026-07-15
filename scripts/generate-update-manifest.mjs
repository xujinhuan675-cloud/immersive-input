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
import { resolveReleaseNotes } from '../updater/release-notes.mjs';

const version = process.env.APP_VERSION || getPackageVersion();
const repository = getRepository();
const releaseTag = getReleaseTag(version);
const notes = await resolveReleaseNotes({
    version,
    repository,
    releaseTag,
    fallback: `Flow Input ${version}`,
});

const manifest = {
    version,
    notes,
    body: notes,
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
