import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardBody, Button, Tabs, Tab, Textarea } from '@nextui-org/react';
import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';
import toast, { Toaster } from 'react-hot-toast';

import { getHistory, clearHistory, exportHistoryMd, countHistory } from '../../../../utils/aiHistory';
import { useToastStyle } from '../../../../hooks';
import { getActiveAiApiConfig } from '../../../../utils/aiConfig';

const TYPE_LABELS = { lightai: 'AI 润色', explain: '解析', chat: '对话' };

async function streamAnalysis(records, apiConfig, onChunk, onComplete, onError, signal) {
    const { apiUrl, apiKey, model, temperature = 0.7 } = apiConfig;
    if (!apiUrl || !apiKey) { onError('请先配置 API Key'); return; }
    let url = apiUrl;
    if (!/https?:\/\/.+/.test(url)) url = `https://${url}`;

    const maxPerField = 500, maxTotal = 20000;
    let sb = '';
    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const src = (r.source || '').slice(0, maxPerField);
        const res = (r.result || '').slice(0, maxPerField);
        const block = `[${i + 1}] (${r.ts})\n原文：${src}\n结果：${res}\n\n`;
        if (sb.length + block.length > maxTotal) break;
        sb += block;
    }

    const systemPrompt = '你是一名写作与表达力分析专家。请基于用户的 AI 交互历史，生成一份简洁可执行的 Markdown 分析报告。';
    const userMsg = `请基于以下 ${records.length} 条历史记录，分析用户的表达习惯和常见改写模式，给出 3~5 条具体可执行的改进建议。\n\n历史记录：\n${sb}`;

    try {
        const res = await window.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }], temperature: Number(temperature), stream: true }),
            signal,
        });
        if (!res.ok) { onError(`HTTP ${res.status}: ${await res.text()}`); return; }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let full = '', buf = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split('\n'); buf = lines.pop();
                for (const line of lines) {
                    const t = line.trim();
                    if (!t || !t.startsWith('data:')) continue;
                    const d = t.slice(5).trim();
                    if (d === '[DONE]') continue;
                    try { const delta = JSON.parse(d)?.choices?.[0]?.delta?.content; if (delta) { full += delta; onChunk(delta); } } catch {}
                }
            }
        } finally { reader.releaseLock(); }
        onComplete(full);
    } catch (e) { onError(e.name === 'AbortError' ? null : e.message); }
}

export default function AIHistory() {
    const toastStyle = useToastStyle();
    const [tab, setTab] = useState('lightai');
    const [records, setRecords] = useState([]);
    const [counts, setCounts] = useState({ lightai: 0, explain: 0, chat: 0 });
    const [report, setReport] = useState('');
    const [generating, setGenerating] = useState(false);
    const abortRef = React.useRef(null);

    const loadRecords = useCallback(async () => {
        const data = await getHistory(tab, 100);
        setRecords(data);
        const c = {};
        for (const k of Object.keys(TYPE_LABELS)) c[k] = await countHistory(k);
        setCounts(c);
    }, [tab]);

    useEffect(() => { loadRecords(); }, [loadRecords]);

    const handleClear = async () => {
        if (!window.confirm(`确定清空「${TYPE_LABELS[tab]}」的全部历史？`)) return;
        await clearHistory(tab);
        toast.success('已清空', { style: toastStyle });
        loadRecords();
    };

    const handleExport = async () => {
        const md = await exportHistoryMd(tab);
        try {
            const path = await save({ filters: [{ name: 'Markdown', extensions: ['md'] }], defaultPath: `AI历史-${tab}-${Date.now()}.md` });
            if (path) { await writeTextFile(path, md); toast.success('导出成功', { style: toastStyle }); }
        } catch (e) { toast.error('导出失败: ' + e.message, { style: toastStyle }); }
    };

    const handleGenerateReport = async () => {
        if (records.length < 3) { toast.error('至少需要 3 条记录才能生成分析报告', { style: toastStyle }); return; }
        try { abortRef.current?.abort(); } catch {}
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setGenerating(true);
        setReport('');

        const apiConfig = await getActiveAiApiConfig();
        if (!apiConfig?.apiKey) {
            toast.error('璇峰厛閰嶇疆 AI API Key', { style: toastStyle });
            setGenerating(false);
            return;
        }

        await streamAnalysis(records, apiConfig,
            (chunk) => setReport((p) => p + chunk),
            () => setGenerating(false),
            (err) => { if (err) toast.error(err, { style: toastStyle }); setGenerating(false); },
            ctrl.signal
        );
    };

    return (
        <div className='p-[10px] max-w-[900px]'>
            <Toaster />
            <Tabs selectedKey={tab} onSelectionChange={setTab} size='sm' className='mb-[10px]'>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <Tab key={k} title={`${v} (${counts[k] ?? 0})`} />
                ))}
            </Tabs>

            {/* Actions */}
            <div className='flex gap-[8px] mb-[10px]'>
                <Button size='sm' variant='bordered' onPress={handleExport} isDisabled={records.length === 0}>导出 Markdown</Button>
                <Button size='sm' variant='bordered' color='danger' onPress={handleClear} isDisabled={records.length === 0}>清空此类型</Button>
                <Button size='sm' color='primary' onPress={handleGenerateReport} isLoading={generating} isDisabled={records.length < 3}>
                    {generating ? '生成中…' : '生成分析报告'}
                </Button>
                {generating && (
                    <Button size='sm' variant='flat' onPress={() => { abortRef.current?.abort(); setGenerating(false); }}>停止</Button>
                )}
            </div>

            {/* Analysis report */}
            {(report || generating) && (
                <Card className='mb-[10px]'>
                    <CardBody>
                        <div className='flex items-center justify-between mb-[8px]'>
                            <h4 className='text-[14px] font-bold'>分析报告</h4>
                            <Button size='sm' variant='flat' onPress={() => setReport('')}>关闭</Button>
                        </div>
                        <Textarea
                            value={report || (generating ? '▋ 生成中…' : '')}
                            readOnly
                            minRows={6}
                            maxRows={20}
                            variant='bordered'
                            className='font-mono text-[12px]'
                        />
                    </CardBody>
                </Card>
            )}

            {/* History list */}
            <Card>
                <CardBody>
                    <h4 className='text-[14px] font-bold mb-[8px]'>最近 {records.length} 条记录</h4>
                    {records.length === 0 ? (
                        <div className='text-default-400 text-[13px]'>暂无记录。使用 AI 润色/解析/对话功能后会自动保存。</div>
                    ) : (
                        <div className='space-y-[8px] max-h-[400px] overflow-auto'>
                            {records.map((r) => (
                                <div key={r.id} className='border border-default-200 rounded-[6px] p-[8px] text-[12px]'>
                                    <div className='text-default-400 mb-[4px]'>{r.ts}</div>
                                    <div className='mb-[4px]'><span className='font-medium'>原文：</span>{(r.source || '').slice(0, 120)}{(r.source || '').length > 120 ? '…' : ''}</div>
                                    <div><span className='font-medium'>结果：</span>{(r.result || '').slice(0, 120)}{(r.result || '').length > 120 ? '…' : ''}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardBody>
            </Card>
        </div>
    );
}
