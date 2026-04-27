import fs from 'fs';

import {
    getPackageVersion,
    getReleaseTag,
    getRepository,
    macUpdaterBundleName,
    releaseDownloadUrl,
    windowsUpdaterBundleName,
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
            platform: 'darwin-aarch64',
            fileName: macUpdaterBundleName(version, 'aarch64'),
            required: false,
        },
        {
            platform: 'darwin-x86_64',
            fileName: macUpdaterBundleName(version, 'x64'),
            required: false,
        },
        {
            platform: 'windows-x86_64',
            fileName: windowsUpdaterBundleName(version, 'x64'),
            required: true,
        },
    ];

    const platforms = {};
    const missingRequiredPlatforms = [];

    for (const asset of assets) {
        const url = releaseDownloadUrl(repository, releaseTag, asset.fileName);
        const signature = await getSignature(`${url}.sig`);

        if (!signature) {
            if (asset.required) {
                missingRequiredPlatforms.push(asset.platform);
            } else {
                console.warn(`Skipping optional updater platform: ${asset.platform}`);
            }
            continue;
        }

        platforms[asset.platform] = {
            signature,
            url,
        };
    }

    if (missingRequiredPlatforms.length > 0) {
        throw new Error(
            `Missing updater signatures for required platforms: ${missingRequiredPlatforms.join(', ')}`
        );
    }

    const notes = `Flow Input ${version}`;
    const manifest = {
        version,
        notes,
        body: notes,
        pub_date: new Date().toISOString(),
        platforms,
    };

    fs.writeFileSync('./latest.json', JSON.stringify(manifest, null, 2));
}

buildManifest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
