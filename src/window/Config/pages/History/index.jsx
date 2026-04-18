import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@nextui-org/react';
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@nextui-org/react';
import { readDir, BaseDirectory, readTextFile, exists, writeTextFile } from '@tauri-apps/api/fs';
import { Textarea, Button, ButtonGroup, Tabs, Tab, Card, CardBody, Pagination } from '@nextui-org/react';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import { save } from '@tauri-apps/api/dialog';
import React, { useEffect, useState, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Database from 'tauri-plugin-sql-api';
import { getHistory, clearHistory, exportHistoryMd, countHistory } from '../../../../utils/aiHistory';

import * as builtinCollectionServices from '../../../../services/collection';
import { invoke_plugin } from '../../../../utils/invoke_plugin';
import * as builtinServices from '../../../../services/translate';
import { useConfig, useToastStyle } from '../../../../hooks';
import { getActiveAiApiConfig } from '../../../../utils/aiConfig';
import { normalizeLanguageKey } from '../../../../utils/language';
import { osType } from '../../../../utils/env';
import {
    ServiceSourceType,
    ServiceType,
    getServiceName,
    getServiceSouceType,
    whetherAvailableService,
} from '../../../../utils/service_instance';

// AI_TYPE_LABELS is now built inside the component using t()

async function streamAnalysis(records, apiConfig, onChunk, onComplete, onError, signal) {
    const { apiUrl, apiKey, model, temperature = 0.7 } = apiConfig;
    if (!apiUrl || !apiKey) { onError('API Key is required'); return; }
    let url = apiUrl;
    if (!/https?:\/\/.+/.test(url)) url = `https://${url}`;
    const maxPerField = 500, maxTotal = 20000;
    let sb = '';
    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const block = `[${i + 1}] (${r.ts})\n原文：${(r.source || '').slice(0, maxPerField)}\n结果：${(r.result || '').slice(0, maxPerField)}\n\n`;
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

// ─── 主组件 ───
export default function History() {
    const [collectionServiceList] = useConfig('collection_service_list', []);
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const [pluginList, setPluginList] = useState(null);
    const [selectedItem, setSelectItem] = useState(null);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [items, setItems] = useState([]);
    const [activeTab, setActiveTab] = useState('translate');
    const pageSize = 12;
    const [aiRefreshSeq, setAiRefreshSeq] = useState(0);
    const [aiPage, setAiPage] = useState(1);
    const [aiTotal, setAiTotal] = useState(0);
    const [aiItems, setAiItems] = useState([]);
    const [aiReport, setAiReport] = useState('');
    const [aiGenerating, setAiGenerating] = useState(false);
    const aiAbortRef = useRef(null);
    const toastStyle = useToastStyle();
    const { t } = useTranslation();
    const historyServiceWidthClass = 'w-[176px] min-w-[176px]';
    const historyTimeWidthClass = 'w-[140px] min-w-[140px]';
    const historyColumnGapClass = 'pr-[12px]';
    const historyContentWidthClass =
        osType === 'Linux'
            ? 'w-[calc((100vw-287px-176px-140px-30px-36px)*0.5)]'
            : 'w-[calc((100vw-287px-176px-140px-36px)*0.5)]';
    // AI tab labels 使用 t() 动态生成，随语言切换
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
        if (activeTab === 'translate') {
            getData();
        }
    }, [total, page, activeTab]);

    useEffect(() => {
        if (activeTab !== 'translate') {
            getAiData();
        }
    }, [activeTab, aiPage, aiTotal]);

    useEffect(() => {
        setAiReport('');
        setAiGenerating(false);
        try {
            aiAbortRef.current?.abort();
        } catch {}
        aiAbortRef.current = null;
    }, [activeTab]);

    const init = async () => {
        const db = await Database.load('sqlite:history.db');
        const result = await db.select('SELECT COUNT(*) FROM history');
        if (result[0] && result[0]['COUNT(*)']) {
            setTotal(result[0]['COUNT(*)']);
        }
    };
    const getData = async () => {
        const db = await Database.load('sqlite:history.db');
        let result = await db.select('SELECT * FROM history ORDER BY id DESC LIMIT $1 OFFSET $2', [pageSize, pageSize * (page - 1)]);
        setItems(result);
    };

    const initAi = async (typeKey) => {
        const cnt = await countHistory(typeKey);
        setAiTotal(cnt);
        setAiPage(1);
    };

    const getAiData = async () => {
        if (!AI_TYPE_LABELS[activeTab]) return;
        const db = await Database.load('sqlite:ai_history.db');
        let result = await db.select(
            'SELECT * FROM ai_history WHERE type = $1 ORDER BY id DESC LIMIT $2 OFFSET $3',
            [activeTab, pageSize, pageSize * (aiPage - 1)]
        );
        setAiItems(result);
    };

    const getSelectedData = async (id) => {
        const db = await Database.load('sqlite:history.db');
        let result = await db.select('SELECT * FROM history WHERE id=$1', [id]);
        setSelectItem(result[0]);
    };
    const clearData = async () => {
        const db = await Database.load('sqlite:history.db');
        await db.execute('DROP TABLE history');
        await db.execute('VACUUM');
        setItems([]);
        setTotal(0);
        setPage(1);
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
        setAiRefreshSeq((v) => v + 1);
        setAiItems([]);
        setAiTotal(0);
        setAiPage(1);
    };

    const exportTranslateMd = async () => {
        const db = await Database.load('sqlite:history.db');
        const rows = await db.select('SELECT * FROM history ORDER BY id DESC LIMIT 500');
        if (!rows?.length) return t('history.empty');
        const lines = [`# ${t('history.export_translate_title')}\n${t('history.export_time')}${new Date().toISOString().replace('T', ' ').substring(0, 19)}\n\n---\n`];
        rows.forEach((r, i) => {
            lines.push(`## ${i + 1}. ${formatDate(new Date(r.timestamp))}`);
            lines.push(`**${t('history.export_service')}** ${r.service ?? ''}`);
            lines.push(`**${t('history.export_source_lang')}** ${r.source ?? ''}`);
            lines.push(`**${t('history.export_target_lang')}** ${r.target ?? ''}`);
            lines.push(`**${t('history.export_source')}**\n${r.text ?? ''}`);
            lines.push(`**${t('history.export_result')}**\n${r.result ?? ''}`);
            lines.push('\n---\n');
        });
        return lines.join('\n');
    };

    const exportActiveTab = async () => {
        try {
            const md =
                activeTab === 'translate'
                    ? await exportTranslateMd()
                    : await exportHistoryMd(activeTab);
            const path = await save({
                filters: [{ name: 'Markdown', extensions: ['md'] }],
                defaultPath:
                    activeTab === 'translate'
                ? `${t('history.export_translate_filename')}-${Date.now()}.md`
                        : `AI-${activeTab}-${Date.now()}.md`,
            });
            if (path) {
                await writeTextFile(path, md);
                toast.success(t('history.export_success'), { style: toastStyle });
            }
        } catch (e) {
            toast.error(t('history.export_failed') + (e?.message ?? e), { style: toastStyle });
        }
    };
    const updateData = async () => {
        const db = await Database.load('sqlite:history.db');
        await db.execute('UPDATE history SET text=$1, result=$2 WHERE id=$3', [
            selectedItem.text,
            selectedItem.result,
            selectedItem.id,
        ]);
        await getData();
    };

    const formatDate = (date) => {
        function padTo2Digits(num) {
            return num.toString().padStart(2, '0');
        }
        const year = date.getFullYear().toString().slice(2, 4);
        const month = padTo2Digits(date.getMonth() + 1);
        const day = padTo2Digits(date.getDate());
        const hour = padTo2Digits(date.getHours());
        const minute = padTo2Digits(date.getMinutes());
        const second = padTo2Digits(date.getSeconds());
        return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
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
    const renderHistoryServiceCell = ({ iconSrc, title, subtitle, titleClassName = '' }) => (
        <div className={`flex ${historyServiceWidthClass} items-center gap-[8px] ${historyColumnGapClass}`}>
            {iconSrc ? (
                <img
                    src={iconSrc}
                    className='block h-[24px] w-[24px] shrink-0 object-contain'
                    draggable={false}
                />
            ) : (
                <div className='h-[24px] w-[24px] shrink-0 rounded-[6px] bg-default-200' />
            )}
            <div className='min-w-0'>
                <p className={`truncate text-[13px] leading-5 ${titleClassName}`}>{title}</p>
                {subtitle ? <p className='truncate text-[12px] leading-4 text-default-500'>{subtitle}</p> : null}
            </div>
        </div>
    );
    const loadPluginList = async () => {
        const serviceTypeList = ['translate', 'collection'];
        let temp = {};
        for (const serviceType of serviceTypeList) {
            temp[serviceType] = {};
            if (await exists(`plugins/${serviceType}`, { dir: BaseDirectory.AppConfig })) {
                const plugins = await readDir(`plugins/${serviceType}`, { dir: BaseDirectory.AppConfig });
                for (const plugin of plugins) {
                    const infoStr = await readTextFile(`plugins/${serviceType}/${plugin.name}/info.json`, {
                        dir: BaseDirectory.AppConfig,
                    });
                    let pluginInfo = JSON.parse(infoStr);
                    if ('icon' in pluginInfo) {
                        const appConfigDirPath = await appConfigDir();
                        const iconPath = await join(
                            appConfigDirPath,
                            `/plugins/${serviceType}/${plugin.name}/${pluginInfo.icon}`
                        );
                        pluginInfo.icon = convertFileSrc(iconPath);
                    }
                    temp[serviceType][plugin.name] = pluginInfo;
                }
            }
        }
        setPluginList({ ...temp });
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
            (_full) => { setAiGenerating(false); aiAbortRef.current = null; },
            (err) => {
                setAiGenerating(false);
                aiAbortRef.current = null;
                if (err) toast.error(t('history.error_generate') + err, { style: toastStyle });
            },
            controller.signal
        );
    };

    const stopAiReport = () => {
        try { aiAbortRef.current?.abort(); } catch {}
        aiAbortRef.current = null;
        setAiGenerating(false);
    };

    return (
        pluginList !== null && (
            <>
                <Toaster />
                {/* 历史类型 Tab */}
                <Tabs
                    selectedKey={activeTab}
                    onSelectionChange={(k) => {
                        setActiveTab(k);
                        if (k === 'translate') {
                            setPage(1);
                            return;
                        }
                        initAi(k);
                    }}
                    size='sm'
                    className='flex justify-center max-h-[calc(100%-40px)] overflow-y-auto mb-[6px]'
                >
                    <Tab key='translate' title={`${t('history.translate_tab')} (${total})`}>
                    {/* 翻译历史内容在下方 */}
                    </Tab>
                    {Object.entries(AI_TYPE_LABELS).map(([k, v]) => (
                        <Tab key={k} title={v} />
                    ))}
                </Tabs>
                {/* 只有翻译 Tab 显示以下内容 */}
                {activeTab === 'translate' && (<>
                <Table
                    fullWidth
                    hideHeader
                    selectionMode='single'
                    selectionBehavior='toggle'
                    aria-label='History Table'
                    classNames={{
                        base: `${
                            osType === 'Linux' ? 'h-[calc(100vh-170px)]' : 'h-[calc(100vh-140px)]'
                        } overflow-y-auto`,
                        td: 'px-0',
                    }}
                    onRowAction={(id) => {
                        getSelectedData(id);
                        onOpen();
                    }}
                >
                    <TableHeader>
                        <TableColumn key='service' />
                        <TableColumn key='text' />
                        <TableColumn key='result' />
                        <TableColumn key='timestamp' />
                    </TableHeader>
                    <TableBody
                        emptyContent={'No History to display.'}
                        items={items}
                    >
                        {(item) =>
                            whetherAvailableService(item.service, {
                                [ServiceSourceType.BUILDIN]: builtinServices,
                                [ServiceSourceType.PLUGIN]: pluginList[ServiceType.TRANSLATE],
                            }) && (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        {renderHistoryServiceCell({
                                            iconSrc: getTranslateServiceIcon(item.service),
                                            title: getTranslateServiceDisplayName(item.service),
                                            subtitle: `${formatLanguageLabel(item.source)} -> ${formatLanguageLabel(item.target)}`,
                                        })}
                                    </TableCell>
                                    <TableCell>
                                        <p
                                            className={`${historyContentWidthClass} ${historyColumnGapClass} whitespace-nowrap overflow-hidden text-ellipsis`}
                                            title={item.text}
                                        >
                                            {item.text}
                                        </p>
                                    </TableCell>
                                    <TableCell>
                                        <p
                                            className={`${historyContentWidthClass} ${historyColumnGapClass} whitespace-nowrap overflow-hidden text-ellipsis`}
                                            title={item.result}
                                        >
                                            {item.result}
                                        </p>
                                    </TableCell>
                                    <TableCell>
                                        <p className={`${historyTimeWidthClass} whitespace-nowrap text-center`}>
                                            {formatDate(new Date(item.timestamp))}
                                        </p>
                                    </TableCell>
                                </TableRow>
                            )
                        }
                    </TableBody>
                </Table>
                </>
                )}

                {activeTab !== 'translate' && AI_TYPE_LABELS[activeTab] && (
                    <>
                        {(aiReport || aiGenerating) && (
                            <Card className='mb-[10px]'>
                                <CardBody>
                                    <div className='flex items-center justify-between mb-[8px]'>
                        <span className='text-[14px] font-bold'>{t('history.report_title')}</span>
                                        <Button size='sm' variant='flat' onPress={() => setAiReport('')}>{t('common.close')}</Button>
                                    </div>
                                    <Textarea
                                        value={aiReport || (aiGenerating ? t('history.generating_placeholder') : '')}
                                        readOnly
                                        minRows={6}
                                        maxRows={18}
                                        variant='bordered'
                                        className='font-mono text-[12px]'
                                    />
                                </CardBody>
                            </Card>
                        )}
                        <Table
                            fullWidth
                            hideHeader
                            selectionMode='single'
                            selectionBehavior='toggle'
                            aria-label='AI History Table'
                            classNames={{
                                base: `${
                                    osType === 'Linux' ? 'h-[calc(100vh-170px)]' : 'h-[calc(100vh-140px)]'
                                } overflow-y-auto`,
                                td: 'px-0',
                            }}
                            onRowAction={(id) => {
                                const found = aiItems.find((x) => String(x.id) === String(id));
                                if (!found) return;
                                setSelectItem({ ...found, __type: 'ai' });
                                onOpen();
                            }}
                        >
                            <TableHeader>
                                <TableColumn key='service' />
                                <TableColumn key='source' />
                                <TableColumn key='result' />
                                <TableColumn key='ts' />
                            </TableHeader>
                            <TableBody emptyContent={'No History to display.'} items={aiItems}>
                                {(item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            {renderHistoryServiceCell({
                                                title: AI_TYPE_LABELS[activeTab],
                                                subtitle: null,
                                                titleClassName: 'text-default-700',
                                            })}
                                        </TableCell>
                                        <TableCell>
                                            <p
                                                className={`${historyContentWidthClass} ${historyColumnGapClass} whitespace-nowrap overflow-hidden text-ellipsis`}
                                                title={item.source}
                                            >
                                                {item.source}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            <p
                                                className={`${historyContentWidthClass} ${historyColumnGapClass} whitespace-nowrap overflow-hidden text-ellipsis`}
                                                title={item.result}
                                            >
                                                {item.result}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            <p className={`${historyTimeWidthClass} whitespace-nowrap text-center`}>{item.ts}</p>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </>
                )}

                <div className='mt-[4px] flex justify-around'>
                    {activeTab === 'translate' ? (
                        <Pagination
                            showControls
                            isCompact
                            total={Math.ceil(total / pageSize)}
                            page={page}
                            onChange={setPage}
                        />
                    ) : AI_TYPE_LABELS[activeTab] ? (
                        <Pagination
                            showControls
                            isCompact
                            total={Math.ceil(aiTotal / pageSize)}
                            page={aiPage}
                            onChange={setAiPage}
                        />
                    ) : (
                        <div />
                    )}
                    <ButtonGroup className='my-auto'>
                        {AI_TYPE_LABELS[activeTab] && (
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
                        {AI_TYPE_LABELS[activeTab] && aiGenerating && (
                            <Button size='sm' variant='flat' onPress={stopAiReport}>{t('history.stop')}</Button>
                        )}
                        <Button size='sm' variant='flat' onPress={exportActiveTab}>{t('history.export')}</Button>
                        <Button size='sm' variant='flat' onPress={clearActiveTab}>{t('common.clear')}</Button>
                    </ButtonGroup>
                </div>
                <Modal
                    isOpen={isOpen}
                    onOpenChange={onOpenChange}
                    scrollBehavior='inside'
                >
                    <ModalContent className='max-h-[80vh]'>
                        {(onClose) =>
                            selectedItem && (
                                <>
                                    <ModalHeader>
                                        <div className='flex justify-start'>
                                            {selectedItem.__type === 'ai' ? (
                                        <span className='text-[14px] font-bold'>{AI_TYPE_LABELS[activeTab]}</span>
                                            ) : getServiceSouceType(selectedItem.service) === ServiceSourceType.PLUGIN ? (
                                                <img
                                                    src={
                                                        pluginList['translate'][getServiceName(selectedItem.service)]
                                                            .icon
                                                    }
                                                    className='h-[24px] w-[24px] my-auto'
                                                    draggable={false}
                                                />
                                            ) : (
                                                <img
                                                    src={`${builtinServices[getServiceName(selectedItem.service)].info.icon}`}
                                                    className='h-[24px] w-[24px] m-auto mr-[8px]'
                                                    draggable={false}
                                                />
                                            )}
                                        </div>
                                    </ModalHeader>
                                    <ModalBody>
                                        <Textarea
                                            label={t('history.modal_before')}
                                            value={selectedItem.__type === 'ai' ? selectedItem.source : selectedItem.text}
                                            readOnly={selectedItem.__type === 'ai'}
                                            onChange={(e) => {
                                                if (selectedItem.__type === 'ai') return;
                                                setSelectItem({ ...selectedItem, text: e.target.value });
                                            }}
                                        />
                                        <Textarea
                                            label={t('history.modal_after')}
                                            value={selectedItem.result}
                                            readOnly={selectedItem.__type === 'ai'}
                                            onChange={(e) => {
                                                if (selectedItem.__type === 'ai') return;
                                                setSelectItem({ ...selectedItem, result: e.target.value });
                                            }}
                                        />
                                    </ModalBody>
                                    {selectedItem.__type === 'ai' ? (
                                        <ModalFooter className='flex justify-end'>
                                            <Button onPress={onClose}>{t('common.close')}</Button>
                                        </ModalFooter>
                                    ) : (
                                        <ModalFooter className='flex justify-end'>
                                            <ButtonGroup>
                                                {collectionServiceList &&
                                                    collectionServiceList.map((instanceKey) => {
                                                        return (
                                                            <Button
                                                                key={instanceKey}
                                                                isIconOnly
                                                                variant='light'
                                                                onPress={async () => {
                                                                    if (
                                                                        getServiceSouceType(instanceKey) ===
                                                                        ServiceSourceType.PLUGIN
                                                                    ) {
                                                                        const pluginConfig =
                                                                            (await store.get(instanceKey)) ?? {};
                                                                        let [func, utils] = await invoke_plugin(
                                                                            'collection',
                                                                            getServiceName(instanceKey)
                                                                        );
                                                                        func(selectedItem.text, selectedItem.result, {
                                                                            config: pluginConfig,
                                                                            utils,
                                                                        }).then(
                                                                            (_) => {
                                                                                toast.success(
                                                                                    t('translate.add_collection_success'),
                                                                                    {
                                                                                        style: toastStyle,
                                                                                    }
                                                                                );
                                                                            },
                                                                            (e) => {
                                                                                toast.error(e.toString(), {
                                                                                    style: toastStyle,
                                                                                });
                                                                            }
                                                                        );
                                                                    } else {
                                                                        const instanceConfig =
                                                                            (await store.get(instanceKey)) ?? {};
                                                                        builtinCollectionServices[
                                                                            getServiceName(instanceKey)
                                                                        ]
                                                                            .collection(
                                                                                selectedItem.text,
                                                                                selectedItem.result,
                                                                                {
                                                                                    config: instanceConfig,
                                                                                }
                                                                            )
                                                                            .then(
                                                                                (_) => {
                                                                                    toast.success(
                                                                                        t(
                                                                                            'translate.add_collection_success'
                                                                                        ),
                                                                                        {
                                                                                            style: toastStyle,
                                                                                        }
                                                                                    );
                                                                                },
                                                                                (e) => {
                                                                                    toast.error(e.toString(), {
                                                                                        style: toastStyle,
                                                                                    });
                                                                                }
                                                                            );
                                                                    }
                                                                }}
                                                            >
                                                                <img
                                                                    src={
                                                                        getServiceSouceType(instanceKey) ===
                                                                        ServiceSourceType.PLUGIN
                                                                            ? pluginList['collection'][
                                                                                  getServiceName(instanceKey)
                                                                              ].icon
                                                                            : builtinCollectionServices[
                                                                                  getServiceName(instanceKey)
                                                                              ].info.icon
                                                                    }
                                                                    className='h-[24px] w-[24px]'
                                                                />
                                                            </Button>
                                                        );
                                                    })}
                                            </ButtonGroup>
                                            <Button
                                                color='primary'
                                                onPress={async () => {
                                                    await updateData();
                                                    onClose();
                                                }}
                                            >
                                                {t('common.save')}
                                            </Button>
                                        </ModalFooter>
                                    )}
                                </>
                            )
                        }
                    </ModalContent>
                </Modal>
            </>
        )
    );
}
