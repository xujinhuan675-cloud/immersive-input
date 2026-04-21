import { readDir, BaseDirectory, readTextFile, exists, writeTextFile } from '@tauri-apps/api/fs';
import { Textarea, Button, Tabs, Tab, Card, CardBody, Pagination } from '@nextui-org/react';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import { save } from '@tauri-apps/api/dialog';
import React, { useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Database from 'tauri-plugin-sql-api';
import { getHistory, clearHistory, exportHistoryMd, countHistory } from '../../../../utils/aiHistory';

import AiProviderIcon from '../../../../components/AiProviderIcon';
import ServiceIdentity from '../../../../components/ServiceIdentity';
import * as builtinServices from '../../../../services/translate';
import { useConfig, useToastStyle } from '../../../../hooks';
import {
    AI_API_SERVICE_LIST_KEY,
    ensureAiApiConfigMigration,
    getActiveAiApiConfig,
    getAiApiDisplayName,
    getAiProviderId,
    getAiProviderTitle,
    getMergedAiApiConfig,
} from '../../../../utils/aiConfig';
import { normalizeLanguageKey } from '../../../../utils/language';
import {
    ServiceSourceType,
    ServiceType,
    getServiceName,
    getServiceSouceType,
    whetherAvailableService,
} from '../../../../utils/service_instance';
import { store } from '../../../../utils/store';

async function streamAnalysis(records, apiConfig, onChunk, onComplete, onError, signal) {
    const { apiUrl, apiKey, model, temperature = 0.7 } = apiConfig;
    if (!apiUrl || !apiKey) {
        onError('API Key is required');
        return;
    }

    let url = apiUrl;
    if (!/https?:\/\/.+/.test(url)) url = `https://${url}`;

    const maxPerField = 500;
    const maxTotal = 20000;
    let input = '';

    for (let i = 0; i < records.length; i += 1) {
        const record = records[i];
        const block =
            `[${i + 1}] (${record.ts})\n` +
            `Source: ${(record.source || '').slice(0, maxPerField)}\n` +
            `Result: ${(record.result || '').slice(0, maxPerField)}\n\n`;
        if (input.length + block.length > maxTotal) break;
        input += block;
    }

    const systemPrompt =
        'You are a writing analyst. Produce a concise markdown report about style patterns and repeat behaviors.';
    const userMsg =
        `Review these ${records.length} history records and summarize the writing habits, rewrite patterns, ` +
        `and 3 to 5 practical suggestions.\n\nHistory:\n${input}`;

    try {
        const res = await window.fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMsg },
                ],
                temperature: Number(temperature),
                stream: true,
            }),
            signal,
        });

        if (!res.ok) {
            onError(`HTTP ${res.status}: ${await res.text()}`);
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = '';
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const text = line.trim();
                    if (!text || !text.startsWith('data:')) continue;
                    const data = text.slice(5).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
                        if (delta) {
                            full += delta;
                            onChunk(delta);
                        }
                    } catch {}
                }
            }
        } finally {
            reader.releaseLock();
        }

        onComplete(full);
    } catch (e) {
        onError(e.name === 'AbortError' ? null : e.message);
    }
}

export default function History() {
    const [aiApiServiceInstanceList] = useConfig(AI_API_SERVICE_LIST_KEY, []);
    const [pluginList, setPluginList] = useState(null);
    const [aiApiConfigMap, setAiApiConfigMap] = useState({});
    const [selectedItem, setSelectItem] = useState(null);
    const [expandedRowKey, setExpandedRowKey] = useState(null);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [items, setItems] = useState([]);
    const [activeTab, setActiveTab] = useState('translate');
    const [aiRefreshSeq, setAiRefreshSeq] = useState(0);
    const [aiPage, setAiPage] = useState(1);
    const [aiTotal, setAiTotal] = useState(0);
    const [aiItems, setAiItems] = useState([]);
    const [aiReport, setAiReport] = useState('');
    const [aiGenerating, setAiGenerating] = useState(false);
    const aiAbortRef = useRef(null);
    const toastStyle = useToastStyle();
    const { t } = useTranslation();
    const pageSize = 6;

    const AI_TYPE_LABELS = {
        lightai: t('history.ai_lightai'),
        explain: t('history.ai_explain'),
        chat: t('history.ai_chat'),
    };

    useEffect(() => {
        init();
        loadPluginList();
    }, []);

    useEffect(() => {
        loadAiApiConfigMap();
    }, [aiApiServiceInstanceList, activeTab]);

    useEffect(() => {
        if (activeTab === 'translate') {
            getData();
        }
    }, [activeTab, page]);

    useEffect(() => {
        if (activeTab !== 'translate') {
            getAiData();
        }
    }, [activeTab, aiPage, aiRefreshSeq]);

    useEffect(() => {
        setAiReport('');
        setAiGenerating(false);
        try {
            aiAbortRef.current?.abort();
        } catch {}
        aiAbortRef.current = null;
    }, [activeTab]);

    useEffect(() => {
        setExpandedRowKey(null);
        setSelectItem(null);
    }, [activeTab, page, aiPage]);

    const init = async () => {
        const db = await Database.load('sqlite:history.db');
        const result = await db.select('SELECT COUNT(*) FROM history');
        setTotal(result?.[0]?.['COUNT(*)'] ?? 0);
    };

    const getData = async () => {
        const db = await Database.load('sqlite:history.db');
        const result = await db.select('SELECT * FROM history ORDER BY id DESC LIMIT $1 OFFSET $2', [
            pageSize,
            pageSize * (page - 1),
        ]);
        setItems(result);
    };

    const initAi = async (typeKey) => {
        const count = await countHistory(typeKey);
        setAiTotal(count);
        setAiPage(1);
    };

    const getAiData = async () => {
        if (!AI_TYPE_LABELS[activeTab]) return;
        const db = await Database.load('sqlite:ai_history.db');
        const result = await db.select('SELECT * FROM ai_history WHERE type = $1 ORDER BY id DESC LIMIT $2 OFFSET $3', [
            activeTab,
            pageSize,
            pageSize * (aiPage - 1),
        ]);
        setAiItems(result);
    };

    const clearData = async () => {
        const db = await Database.load('sqlite:history.db');
        await db.execute('DELETE FROM history');
        await db.execute('VACUUM');
        setItems([]);
        setTotal(0);
        setPage(1);
        setExpandedRowKey(null);
        setSelectItem(null);
    };

    const clearActiveTab = async () => {
        if (activeTab === 'translate') {
            if (!window.confirm(t('history.confirm_clear_translate'))) return;
            await clearData();
            toast.success(t('history.cleared'), { style: toastStyle });
            return;
        }

        if (!AI_TYPE_LABELS[activeTab]) return;
        if (!window.confirm(t('history.confirm_clear_ai', { name: AI_TYPE_LABELS[activeTab] }))) return;

        await clearHistory(activeTab);
        toast.success(t('history.cleared'), { style: toastStyle });
        setAiRefreshSeq((value) => value + 1);
        setAiItems([]);
        setAiTotal(0);
        setAiPage(1);
        setExpandedRowKey(null);
        setSelectItem(null);
    };

    const exportTranslateMd = async () => {
        const db = await Database.load('sqlite:history.db');
        const rows = await db.select('SELECT * FROM history ORDER BY id DESC LIMIT 500');

        if (!rows?.length) {
            return t('history.empty');
        }

        const lines = [
            `# ${t('history.export_translate_title')}\n${t('history.export_time')}${new Date()
                .toISOString()
                .replace('T', ' ')
                .substring(0, 19)}\n\n---\n`,
        ];

        rows.forEach((row, index) => {
            lines.push(`## ${index + 1}. ${formatDate(new Date(row.timestamp))}`);
            lines.push(`**${t('history.export_service')}** ${row.service ?? ''}`);
            lines.push(`**${t('history.export_source_lang')}** ${row.source ?? ''}`);
            lines.push(`**${t('history.export_target_lang')}** ${row.target ?? ''}`);
            lines.push(`**${t('history.export_source')}**\n${row.text ?? ''}`);
            lines.push(`**${t('history.export_result')}**\n${row.result ?? ''}`);
            lines.push('\n---\n');
        });

        return lines.join('\n');
    };

    const exportActiveTab = async () => {
        try {
            const md = activeTab === 'translate' ? await exportTranslateMd() : await exportHistoryMd(activeTab);
            const path = await save({
                filters: [{ name: 'Markdown', extensions: ['md'] }],
                defaultPath:
                    activeTab === 'translate'
                        ? `${t('history.export_translate_filename')}-${Date.now()}.md`
                        : `AI-${activeTab}-${Date.now()}.md`,
            });

            if (!path) return;

            await writeTextFile(path, md);
            toast.success(t('history.export_success'), { style: toastStyle });
        } catch (e) {
            toast.error(t('history.export_failed') + (e?.message ?? e), { style: toastStyle });
        }
    };

    const updateData = async () => {
        if (!selectedItem || selectedItem.__type === 'ai') return;

        const db = await Database.load('sqlite:history.db');
        await db.execute('UPDATE history SET text=$1, result=$2 WHERE id=$3', [
            selectedItem.text,
            selectedItem.result,
            selectedItem.id,
        ]);

        await getData();
        setItems((current) =>
            current.map((item) =>
                item.id === selectedItem.id ? { ...item, text: selectedItem.text, result: selectedItem.result } : item
            )
        );
        toast.success(t('common.save'), { style: toastStyle });
    };

    const formatDate = (date) => {
        const pad = (num) => num.toString().padStart(2, '0');
        const year = date.getFullYear().toString().slice(2, 4);
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hour = pad(date.getHours());
        const minute = pad(date.getMinutes());
        const second = pad(date.getSeconds());
        return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
    };
    const formatFullDate = (date) => {
        const pad = (num) => num.toString().padStart(2, '0');
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hour = pad(date.getHours());
        const minute = pad(date.getMinutes());
        const second = pad(date.getSeconds());
        return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
    };
    const parseHistoryDate = (value) => {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    };
    const formatListTime = (value) => {
        const date = parseHistoryDate(value);
        if (!date) return value ?? '-';

        const now = new Date();
        const isSameDay =
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();
        const pad = (num) => num.toString().padStart(2, '0');

        if (isSameDay) {
            return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }

        return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
    };
    const formatExpandedTime = (value) => {
        const date = parseHistoryDate(value);
        if (!date) return value ?? '-';
        return formatFullDate(date);
    };

    const formatLanguageLabel = (language) => {
        const normalized = normalizeLanguageKey(language);
        return t(`languages.${normalized}`, { defaultValue: language ?? '' });
    };

    const getTranslateServiceDisplayName = (serviceInstanceKey) => {
        const serviceName = getServiceName(serviceInstanceKey);
        if (getServiceSouceType(serviceInstanceKey) === ServiceSourceType.PLUGIN) {
            return pluginList?.[ServiceType.TRANSLATE]?.[serviceName]?.display ?? serviceName;
        }
        return t(`services.translate.${serviceName}.title`, { defaultValue: serviceName });
    };

    const getTranslateServiceIcon = (serviceInstanceKey) => {
        const serviceName = getServiceName(serviceInstanceKey);
        if (getServiceSouceType(serviceInstanceKey) === ServiceSourceType.PLUGIN) {
            return pluginList?.[ServiceType.TRANSLATE]?.[serviceName]?.icon ?? null;
        }
        return builtinServices[serviceName]?.info.icon ?? null;
    };

    const getRowKey = (item, typeKey = activeTab) => `${typeKey}-${item.id}`;

    const getPreviewText = (value) => (value ?? '').replace(/\s+/g, ' ').trim();

    const getTranslateContentPreview = (item) => ({
        source: getPreviewText(item.text),
        result: getPreviewText(item.result),
    });

    const getAiContentPreview = (item) => ({
        source: getPreviewText(item.source),
        result: getPreviewText(item.result),
    });
    const parseAiHistoryExtra = (extra) => {
        if (!extra) return {};
        if (typeof extra === 'object') return extra;

        try {
            return JSON.parse(extra);
        } catch {
            return {};
        }
    };
    const getFallbackAiConfig = () => {
        if (aiApiServiceInstanceList.length !== 1) return null;
        const instanceKey = aiApiServiceInstanceList[0];
        return aiApiConfigMap[instanceKey] ?? null;
    };
    const getAiServiceInfo = (item) => {
        const extra = parseAiHistoryExtra(item?.extra);
        const extraInstanceKey = extra?.serviceInstanceKey ?? null;
        const currentConfig = extraInstanceKey ? aiApiConfigMap[extraInstanceKey] ?? null : null;
        const fallbackConfig = currentConfig ?? getFallbackAiConfig();
        const providerId = extra?.providerId ?? getAiProviderId(currentConfig ?? fallbackConfig ?? {});
        const displayName =
            extra?.serviceDisplayName ??
            getAiApiDisplayName(currentConfig ?? fallbackConfig ?? {}, getAiProviderTitle(providerId));

        return {
            providerId,
            displayName,
            typeLabel: AI_TYPE_LABELS[item?.type ?? activeTab] ?? AI_TYPE_LABELS[activeTab],
        };
    };

    const toggleRow = (item, typeKey = activeTab) => {
        const rowKey = getRowKey(item, typeKey);
        if (expandedRowKey === rowKey) {
            setExpandedRowKey(null);
            setSelectItem(null);
            return;
        }

        setExpandedRowKey(rowKey);
        setSelectItem(typeKey === 'translate' ? { ...item } : { ...item, __type: 'ai' });
    };

    const updateSelectedTranslateField = (field, value) => {
        setSelectItem((current) => {
            if (!current || current.__type === 'ai') return current;
            return { ...current, [field]: value };
        });
    };

    const loadAiApiConfigMap = async () => {
        const instanceList = await ensureAiApiConfigMigration();
        const nextMap = {};

        for (const instanceKey of instanceList) {
            const config = await store.get(instanceKey);
            nextMap[instanceKey] = {
                ...getMergedAiApiConfig(config ?? {}),
                instanceKey,
            };
        }

        setAiApiConfigMap(nextMap);
    };

    const loadPluginList = async () => {
        const serviceTypeList = ['translate'];
        const nextPlugins = {};

        for (const serviceType of serviceTypeList) {
            nextPlugins[serviceType] = {};
            if (!(await exists(`plugins/${serviceType}`, { dir: BaseDirectory.AppConfig }))) continue;

            const plugins = await readDir(`plugins/${serviceType}`, { dir: BaseDirectory.AppConfig });
            for (const plugin of plugins) {
                const infoStr = await readTextFile(`plugins/${serviceType}/${plugin.name}/info.json`, {
                    dir: BaseDirectory.AppConfig,
                });
                const pluginInfo = JSON.parse(infoStr);

                if ('icon' in pluginInfo) {
                    const appConfigDirPath = await appConfigDir();
                    const iconPath = await join(
                        appConfigDirPath,
                        `/plugins/${serviceType}/${plugin.name}/${pluginInfo.icon}`
                    );
                    pluginInfo.icon = convertFileSrc(iconPath);
                }

                nextPlugins[serviceType][plugin.name] = pluginInfo;
            }
        }

        setPluginList(nextPlugins);
    };

    const generateAiReport = async () => {
        if (aiGenerating) return;

        const apiConfig = await getActiveAiApiConfig();
        if (!apiConfig?.apiKey) {
            toast.error(t('history.error_no_api_key'), { style: toastStyle });
            return;
        }

        const records = await getHistory(activeTab, 200);
        if (records.length < 3) {
            toast.error(t('history.error_insufficient'), { style: toastStyle });
            return;
        }

        setAiReport('');
        setAiGenerating(true);
        const controller = new AbortController();
        aiAbortRef.current = controller;

        await streamAnalysis(
            records,
            apiConfig,
            (chunk) => setAiReport((prev) => prev + chunk),
            () => {
                setAiGenerating(false);
                aiAbortRef.current = null;
            },
            (err) => {
                setAiGenerating(false);
                aiAbortRef.current = null;
                if (err) {
                    toast.error(t('history.error_generate') + err, { style: toastStyle });
                }
            },
            controller.signal
        );
    };

    const stopAiReport = () => {
        try {
            aiAbortRef.current?.abort();
        } catch {}
        aiAbortRef.current = null;
        setAiGenerating(false);
    };

    const isAiTab = activeTab !== 'translate' && Boolean(AI_TYPE_LABELS[activeTab]);
    const translateItems = items.filter((item) =>
        whetherAvailableService(item.service, {
            [ServiceSourceType.BUILDIN]: builtinServices,
            [ServiceSourceType.PLUGIN]: pluginList?.[ServiceType.TRANSLATE],
        })
    );
    const visibleItems = isAiTab ? aiItems : translateItems;
    const currentTotal = activeTab === 'translate' ? total : aiTotal;
    const totalPages = Math.ceil((activeTab === 'translate' ? total : aiTotal) / pageSize);
    const currentPage = activeTab === 'translate' ? page : aiPage;
    const emptyHistoryText = t('history.empty', { defaultValue: 'No History to display.' });
    const sourceLabel = t('history.modal_before', { defaultValue: '原文' });
    const resultLabel = t('history.modal_after', { defaultValue: '结果' });
    const countText = t('history.records_count', {
        count: currentTotal,
        defaultValue: `共 ${currentTotal} 条`,
    });

    const renderExpandedContent = () => {
        if (!selectedItem) return null;

        const isAiItem = selectedItem.__type === 'ai';
        const sourceValue = isAiItem ? selectedItem.source : selectedItem.text;
        const aiServiceInfo = isAiItem ? getAiServiceInfo(selectedItem) : null;
        const expandedServiceTitle = isAiItem
            ? aiServiceInfo.displayName
            : getTranslateServiceDisplayName(selectedItem.service);
        const expandedSubtitle = isAiItem
            ? aiServiceInfo.typeLabel
            : `${formatLanguageLabel(selectedItem.source)} -> ${formatLanguageLabel(selectedItem.target)}`;
        const expandedTime = isAiItem
            ? formatExpandedTime(selectedItem.ts)
            : formatExpandedTime(selectedItem.timestamp);

        return (
            <div className='grid gap-[12px] border-t border-default-100 bg-default-50/50 px-[18px] py-[16px]'>
                <div className='flex flex-wrap items-center justify-between gap-[8px] text-[12px] text-default-400'>
                    <div className='min-w-0'>
                        <span className='font-medium text-default-500'>{expandedServiceTitle}</span>
                        {expandedSubtitle ? <span className='ml-[8px]'>{expandedSubtitle}</span> : null}
                    </div>
                    <span>{expandedTime}</span>
                </div>
                <Textarea
                    label={sourceLabel}
                    value={sourceValue ?? ''}
                    readOnly={isAiItem}
                    minRows={4}
                    variant='bordered'
                    onChange={(e) => updateSelectedTranslateField('text', e.target.value)}
                />
                <Textarea
                    label={resultLabel}
                    value={selectedItem.result ?? ''}
                    readOnly={isAiItem}
                    minRows={4}
                    variant='bordered'
                    onChange={(e) => updateSelectedTranslateField('result', e.target.value)}
                />
                {!isAiItem && (
                    <div className='flex flex-wrap items-center justify-end gap-[8px]'>
                        <div className='flex items-center gap-[8px]'>
                            <Button
                                size='sm'
                                variant='flat'
                                onPress={() => {
                                    setExpandedRowKey(null);
                                    setSelectItem(null);
                                }}
                            >
                                {t('common.close')}
                            </Button>
                            <Button
                                size='sm'
                                color='primary'
                                onPress={updateData}
                            >
                                {t('common.save')}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderHistoryRow = (item) => {
        const rowKey = getRowKey(item, activeTab);
        const expanded = expandedRowKey === rowKey;
        const preview = isAiTab ? getAiContentPreview(item) : getTranslateContentPreview(item);
        const aiServiceInfo = isAiTab ? getAiServiceInfo(item) : null;
        const serviceTitle = isAiTab ? aiServiceInfo.displayName : getTranslateServiceDisplayName(item.service);
        const timeText = isAiTab ? formatListTime(item.ts) : formatListTime(item.timestamp);

        return (
            <div
                key={rowKey}
                className='border-t border-default-100 first:border-t-0'
            >
                <button
                    type='button'
                    onClick={() => toggleRow(item, activeTab)}
                    className='grid w-full grid-cols-[minmax(0,116px)_minmax(0,1fr)_56px] items-start gap-[8px] px-[12px] py-[14px] text-left transition-colors hover:bg-default-50'
                >
                    <div className='min-w-0'>
                        <ServiceIdentity
                            iconSrc={isAiTab ? null : getTranslateServiceIcon(item.service)}
                            iconNode={isAiTab ? <AiProviderIcon providerId={aiServiceInfo.providerId} /> : null}
                            title={serviceTitle}
                            titleClassName={isAiTab ? 'text-default-700' : ''}
                        />
                    </div>
                    <div className='min-w-0 space-y-[4px]'>
                        <p
                            className='truncate text-[13px] leading-5 text-default-600'
                            title={preview.source}
                        >
                            {preview.source || '-'}
                        </p>
                        <p
                            className='truncate text-[13px] leading-5 text-default-500'
                            title={preview.result}
                        >
                            {preview.result || '-'}
                        </p>
                    </div>
                    <p className='pt-[2px] text-right text-[12px] leading-5 text-default-400'>{timeText}</p>
                </button>
                {expanded ? renderExpandedContent() : null}
            </div>
        );
    };

    return (
        pluginList !== null && (
            <>
                <Toaster />
                <div className='mx-auto flex max-w-[1048px] flex-col gap-[10px] px-[8px] pb-[8px]'>
                    <Tabs
                        selectedKey={activeTab}
                        onSelectionChange={(key) => {
                            const nextKey = String(key);
                            setActiveTab(nextKey);
                            if (nextKey === 'translate') {
                                setPage(1);
                                return;
                            }
                            initAi(nextKey);
                        }}
                        size='sm'
                        className='flex justify-center'
                    >
                        <Tab
                            key='translate'
                            title={t('history.translate_tab')}
                        />
                        {Object.entries(AI_TYPE_LABELS).map(([key, label]) => (
                            <Tab
                                key={key}
                                title={label}
                            />
                        ))}
                    </Tabs>

                    {isAiTab && (aiReport || aiGenerating) && (
                        <Card className='border border-default-100 bg-default-50/70 shadow-none'>
                            <CardBody className='gap-[8px] p-[12px]'>
                                <div className='flex items-center justify-between'>
                                    <span className='text-[13px] font-medium text-default-600'>
                                        {t('history.report_title')}
                                    </span>
                                    <Button
                                        size='sm'
                                        variant='flat'
                                        onPress={() => setAiReport('')}
                                    >
                                        {t('common.close')}
                                    </Button>
                                </div>
                                <Textarea
                                    value={aiReport || (aiGenerating ? t('history.generating_placeholder') : '')}
                                    readOnly
                                    minRows={5}
                                    maxRows={14}
                                    variant='bordered'
                                    className='font-mono text-[12px]'
                                />
                            </CardBody>
                        </Card>
                    )}

                    <Card className='border border-default-100 bg-white shadow-none'>
                        <CardBody className='gap-[10px] p-[10px]'>
                            <div className='overflow-hidden rounded-[18px] border border-default-100 bg-white'>
                                <div className='grid grid-cols-[minmax(0,116px)_minmax(0,1fr)_56px] gap-[8px] px-[12px] py-[11px] text-[11px] font-medium uppercase tracking-[0.08em] text-default-400'>
                                    <span>{t('history.service', { defaultValue: '服务' })}</span>
                                    <span>{t('history.content', { defaultValue: '内容' })}</span>
                                    <span className='text-right'>{t('history.time', { defaultValue: '时间' })}</span>
                                </div>

                                {visibleItems.length > 0 ? (
                                    <div>{visibleItems.map((item) => renderHistoryRow(item))}</div>
                                ) : (
                                    <div className='px-[18px] py-[48px] text-center text-[13px] text-default-400'>
                                        {emptyHistoryText}
                                    </div>
                                )}
                            </div>

                            <div className='flex flex-wrap items-center justify-between gap-[10px] pt-[4px]'>
                                <div className='flex flex-wrap items-center gap-[8px]'>
                                    {isAiTab && (
                                        <Button
                                            size='sm'
                                            color='primary'
                                            isLoading={aiGenerating}
                                            onPress={generateAiReport}
                                            isDisabled={aiTotal < 3}
                                        >
                                            {aiGenerating ? t('history.generating_btn') : t('history.generate_report')}
                                        </Button>
                                    )}
                                    {isAiTab && aiGenerating && (
                                        <Button
                                            size='sm'
                                            variant='flat'
                                            onPress={stopAiReport}
                                        >
                                            {t('history.stop')}
                                        </Button>
                                    )}
                                    <Button
                                        size='sm'
                                        variant='flat'
                                        onPress={exportActiveTab}
                                    >
                                        {t('history.export')}
                                    </Button>
                                    <Button
                                        size='sm'
                                        variant='flat'
                                        onPress={clearActiveTab}
                                    >
                                        {t('common.clear')}
                                    </Button>
                                </div>

                                {(currentTotal > 0 || totalPages > 1) && (
                                    <div className='flex items-center gap-[12px] text-[12px] text-default-400'>
                                        <span>{countText}</span>
                                        <Pagination
                                            showControls
                                            isCompact
                                            total={Math.max(totalPages, 1)}
                                            page={currentPage}
                                            onChange={activeTab === 'translate' ? setPage : setAiPage}
                                        />
                                    </div>
                                )}
                            </div>
                        </CardBody>
                    </Card>
                </div>
            </>
        )
    );
}
