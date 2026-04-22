import { fetch, Body } from '@tauri-apps/api/http';
import { PDFDocument } from 'pdf-lib';

import { base64ToBytes, sleep } from '../shared';

function normalizeMarkdown(content, mathFormat) {
    const trimmed = String(content ?? '')
        .replace(/^##\s*md:\s*"/, '')
        .replace(/"$/, '')
        .trim();

    if (mathFormat !== 'obsidian') {
        return trimmed;
    }

    return trimmed
        .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expression) => `$$\n${expression.trim()}\n$$`)
        .replace(/\\\((.*?)\\\)/g, (_, expression) => `$${expression.trim()}$`);
}

async function imageBase64ToPdfBytes(base64) {
    const pdfDocument = await PDFDocument.create();
    const image = await pdfDocument.embedPng(base64ToBytes(base64));
    const page = pdfDocument.addPage([image.width, image.height]);
    page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
    });
    return await pdfDocument.save();
}

async function pollParseStatus(uid, token, showDebug = false, mathFormat = 'latex') {
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await sleep(2000);

        const res = await fetch(`https://v2.doc2x.noedgeai.com/api/v2/parse/status?uid=${uid}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        });

        if (!res.ok) {
            throw new Error(`Parse status request failed (HTTP ${res.status})`);
        }

        const responseData = res.data;
        const data = responseData?.data;
        if (!data) {
            throw new Error('Doc2x response missing data field');
        }

        if (data.status === 'success') {
            if (!data.result?.pages?.length) {
                throw new Error('Doc2x response missing parsed pages');
            }

            if (showDebug) {
                return JSON.stringify(data.result, null, 2);
            }

            return data.result.pages
                .map((page, index) => {
                    const content =
                        mathFormat === 'obsidian'
                            ? normalizeMarkdown(page.md_dollar || page.md || page.text || '', 'obsidian')
                            : normalizeMarkdown(page.md || page.md_dollar || page.text || '', mathFormat);
                    return data.result.pages.length > 1 ? `--- Page ${index + 1} ---\n${content}` : content;
                })
                .join('\n\n')
                .trim();
        }

        if (data.status === 'failed') {
            throw new Error(data.detail || 'Doc2x parse failed');
        }
    }

    throw new Error('Doc2x parse timeout');
}

export async function recognize(base64, _language, options = {}) {
    const { config } = options;
    const { token, showDebug = 'false', mathFormat = 'latex' } = config;

    if (!token?.trim()) {
        throw new Error('Doc2x API token is required');
    }

    const pdfBytes = await imageBase64ToPdfBytes(base64);
    const uploadRes = await fetch('https://v2.doc2x.noedgeai.com/api/v2/parse/pdf', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token.trim()}`,
            'Content-Type': 'application/octet-stream',
            Accept: 'application/json',
        },
        body: Body.bytes(pdfBytes),
    });

    if (!uploadRes.ok) {
        if (uploadRes.status === 401) throw new Error('Invalid Doc2x API token');
        if (uploadRes.status === 429) throw new Error('Doc2x rate limit exceeded');
        if (uploadRes.status === 413) throw new Error('Screenshot is too large for Doc2x');
        throw new Error(`Doc2x upload failed (HTTP ${uploadRes.status})`);
    }

    const uploadData = uploadRes.data;
    if (uploadData?.code !== 'success' || !uploadData?.data?.uid) {
        throw new Error(uploadData?.message || 'Doc2x upload failed');
    }

    return await pollParseStatus(uploadData.data.uid, token.trim(), showDebug === 'true', mathFormat);
}

export * from './Config';
export * from './info';
