import fs from 'fs';

function normalizeNotes(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
}

function readNotesFile(filePath) {
    try {
        return normalizeNotes(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.warn(`Unable to read release notes file: ${filePath}`);
        console.warn(error?.message || error);
        return '';
    }
}

async function fetchGitHubReleaseBody(repository, releaseTag) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

    if (!token || !repository || !releaseTag) {
        return '';
    }

    const url = `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`;

    try {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'flow-input-updater-manifest',
            },
        });

        if (!response.ok) {
            console.warn(`Unable to fetch GitHub release notes: ${response.status} ${response.statusText}`);
            return '';
        }

        const release = await response.json();
        return normalizeNotes(release.body);
    } catch (error) {
        console.warn('Unable to fetch GitHub release notes');
        console.warn(error?.message || error);
        return '';
    }
}

export async function resolveReleaseNotes({ version, repository, releaseTag, fallback }) {
    const envNotes = normalizeNotes(process.env.RELEASE_NOTES);
    if (envNotes) {
        return envNotes;
    }

    const notesPath = normalizeNotes(process.env.RELEASE_NOTES_PATH);
    if (notesPath) {
        const fileNotes = readNotesFile(notesPath);
        if (fileNotes) {
            return fileNotes;
        }
    }

    const releaseBody = await fetchGitHubReleaseBody(repository, releaseTag);
    if (releaseBody) {
        return releaseBody;
    }

    return fallback || `Flow Input ${version}`;
}
