import fs from 'fs';

import {
    getPackageVersion,
    getReleaseTag,
    getRepository,
    releaseDownloadUrl,
    windowsFixRuntimeUpdaterBundleName,
} from '../scripts/release-assets.mjs';

async function getSignature(url) {
    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/octet-stream' },
    });

    if (!response.ok) {
        return '';
    }

    return response.text();
}

async function buildManifest() {
    const version = process.env.APP_VERSION || getPackageVersion();
    const repository = getRepository();
    const releaseTag = getReleaseTag(version);

    const assets = [
        {
            platform: 'windows-x86_64',
            fileName: windowsFixRuntimeUpdaterBundleName(version, 'x64'),
        },
        {
            platform: 'windows-i686',
            fileName: windowsFixRuntimeUpdaterBundleName(version, 'x86'),
        },
        {
            platform: 'windows-aarch64',
            fileName: windowsFixRuntimeUpdaterBundleName(version, 'arm64'),
        },
    ];

    const platforms = {};
    const missingPlatforms = [];

    for (const asset of assets) {
        const url = releaseDownloadUrl(repository, releaseTag, asset.fileName);
        const signature = await getSignature(`${url}.sig`);

        if (!signature) {
            missingPlatforms.push(asset.platform);
            continue;
        }

        platforms[asset.platform] = {
            signature,
            url,
        };
    }

    if (missingPlatforms.length > 0) {
        throw new Error(`Missing updater signatures for: ${missingPlatforms.join(', ')}`);
    }

    const notes = `Flow Input ${version} (fixed WebView2 runtime)`;
    const manifest = {
        version,
        notes,
        body: notes,
        pub_date: new Date().toISOString(),
        platforms,
    };

    fs.writeFileSync('./update-fix-runtime.json', JSON.stringify(manifest, null, 2));
}

buildManifest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
