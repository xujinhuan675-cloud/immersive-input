import { Button, Code, Progress } from '@nextui-org/react';
import { listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/api/process';
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
import { appWindow, LogicalSize } from '@tauri-apps/api/window';
import React, { useEffect, useMemo, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';

import WindowHeader, {
    WindowHeaderCloseButton,
    WindowHeaderTitle,
} from '../../components/WindowHeader';
import {
    TRAY_WINDOW_HEADER_STYLE,
    TRAY_WINDOW_PRIMARY_BUTTON_STYLE,
    TRAY_WINDOW_TITLE_STYLE,
    TRAY_WINDOW_TITLE_TEXT_STYLE,
    TrayWindow,
    TrayWindowBody,
    TrayWindowSurface,
} from '../../components/TrayWindow';
import { useToastStyle } from '../../hooks';
import { osType } from '../../utils/env';

let unlisten = 0;
let eventId = 0;

const UPDATER_WINDOW_PRESETS = {
    latest: { width: 520, height: 320 },
    checking: { width: 540, height: 360 },
    error: { width: 560, height: 360 },
    update: { width: 640, height: 460 },
};

function getLocalizedDefaultValue(isChineseUI, zhText, enText) {
    return isChineseUI ? zhText : enText;
}

function MarkdownContent({ body }) {
    return (
        <ReactMarkdown
            className='markdown-body select-text'
            components={{
                code: ({ children }) => <Code size='sm'>{children}</Code>,
                h1: ({ ...props }) => <h1 className='text-[20px] font-semibold tracking-[-0.01em] text-foreground' {...props} />,
                h2: ({ ...props }) => <h2 className='text-[18px] font-semibold tracking-[-0.01em] text-foreground' {...props} />,
                h3: ({ ...props }) => <h3 className='text-[15px] font-semibold text-foreground' {...props} />,
                p: ({ ...props }) => <p className='mb-3 text-[13px] leading-6 text-default-600 last:mb-0' {...props} />,
                ul: ({ ...props }) => <ul className='mb-3 space-y-2 pl-5 text-[13px] leading-6 text-default-600 last:mb-0' {...props} />,
                ol: ({ ...props }) => <ol className='mb-3 space-y-2 pl-5 text-[13px] leading-6 text-default-600 last:mb-0' {...props} />,
                li: ({ ...props }) => <li className='list-disc' {...props} />,
                hr: () => <div className='my-4 border-t border-default-200/70' />,
                strong: ({ ...props }) => <strong className='font-semibold text-foreground' {...props} />,
            }}
        >
            {body}
        </ReactMarkdown>
    );
}

export default function Updater() {
    const [downloaded, setDownloaded] = useState(0);
    const [total, setTotal] = useState(0);
    const [body, setBody] = useState('');
    const [hasUpdate, setHasUpdate] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [releaseVersion, setReleaseVersion] = useState('');
    const { t, i18n } = useTranslation();
    const toastStyle = useToastStyle();
    const isChineseUI = i18n.language?.startsWith('zh');

    useEffect(() => {
        if (appWindow.label === 'updater') {
            appWindow.show();
        }

        setIsChecking(true);
        checkUpdate().then(
            (update) => {
                setHasUpdate(Boolean(update.shouldUpdate));
                setReleaseVersion(String(update.manifest?.version || '').trim());
                setErrorMessage('');
                setBody(update.shouldUpdate ? update.manifest.body || update.manifest.notes || '' : '');
                setIsChecking(false);
            },
            (error) => {
                const nextError = error?.toString?.() || String(error);
                setHasUpdate(false);
                setReleaseVersion('');
                setBody('');
                setErrorMessage(nextError);
                setIsChecking(false);
                toast.error(nextError, { style: toastStyle });
            }
        );

        if (unlisten === 0) {
            unlisten = listen('tauri://update-download-progress', (event) => {
                if (eventId === 0) {
                    eventId = event.id;
                }

                if (event.id === eventId) {
                    setTotal(event.payload.contentLength);
                    setDownloaded((value) => value + event.payload.chunkLength);
                }
            });
        }
    }, []);

    const isBusy = downloaded !== 0;
    const isInstalling = isBusy && total > 0 && downloaded > total;
    const progressValue = total > 0 ? Math.min((downloaded / total) * 100, 100) : 0;
    const isLatestState = !isChecking && !errorMessage && !hasUpdate;
    const closeButtonLabel = t('common.close', {
        defaultValue: getLocalizedDefaultValue(isChineseUI, '关闭', 'Close'),
    });

    const windowPreset = useMemo(() => {
        if (isChecking) {
            return UPDATER_WINDOW_PRESETS.checking;
        }

        if (errorMessage) {
            return UPDATER_WINDOW_PRESETS.error;
        }

        if (hasUpdate) {
            return UPDATER_WINDOW_PRESETS.update;
        }

        return UPDATER_WINDOW_PRESETS.latest;
    }, [errorMessage, hasUpdate, isChecking]);

    useEffect(() => {
        if (appWindow.label !== 'updater') {
            return;
        }

        let cancelled = false;

        async function syncWindowFrame() {
            try {
                await appWindow.setResizable(true);
                await appWindow.setMinSize(new LogicalSize(480, 320));
                await appWindow.setSize(new LogicalSize(windowPreset.width, windowPreset.height));
                if (!cancelled) {
                    await appWindow.center();
                }
            } catch (_) {}
        }

        void syncWindowFrame();

        return () => {
            cancelled = true;
        };
    }, [windowPreset]);

    const statusCopy = useMemo(() => {
        if (isChecking) {
            return {
                badge: getLocalizedDefaultValue(isChineseUI, '正在检查', 'Checking'),
                headline: getLocalizedDefaultValue(isChineseUI, '正在获取更新信息', 'Checking for updates'),
                description: getLocalizedDefaultValue(
                    isChineseUI,
                    '我们正在检查当前版本状态，请稍等片刻。',
                    'We are checking the current version status. Please wait a moment.'
                ),
            };
        }

        if (errorMessage) {
            return {
                badge: getLocalizedDefaultValue(isChineseUI, '检查失败', 'Check failed'),
                headline: getLocalizedDefaultValue(isChineseUI, '暂时无法完成检查', 'Unable to check right now'),
                description: getLocalizedDefaultValue(
                    isChineseUI,
                    '这次没有成功获取更新信息。你可以关闭窗口后稍后再试。',
                    'We could not retrieve update information this time. You can close this window and try again later.'
                ),
            };
        }

        if (hasUpdate) {
            return {
                badge: getLocalizedDefaultValue(isChineseUI, '发现新版本', 'Update available'),
                headline: getLocalizedDefaultValue(isChineseUI, '发现可安装的新版本', 'A new version is ready'),
                description: getLocalizedDefaultValue(
                    isChineseUI,
                    '你可以现在开始更新，也可以先查看下面的版本说明后再决定。',
                    'You can update now, or review the release notes below before deciding.'
                ),
            };
        }

        return {
            badge: getLocalizedDefaultValue(isChineseUI, '已是最新', 'Up to date'),
            headline: getLocalizedDefaultValue(isChineseUI, '已经是最新版本', 'The latest version is installed'),
            description: getLocalizedDefaultValue(
                isChineseUI,
                '当前没有可用更新。后续有新版本时，会在这里第一时间提示你。',
                'There are no updates available right now. New releases will appear here when they are ready.'
            ),
        };
    }, [errorMessage, hasUpdate, isChecking, isChineseUI]);

    const panelTitle = useMemo(() => {
        if (errorMessage) {
            return getLocalizedDefaultValue(isChineseUI, '错误详情', 'Error details');
        }

        if (hasUpdate) {
            return getLocalizedDefaultValue(isChineseUI, '版本说明', 'Release notes');
        }

        return '';
    }, [errorMessage, hasUpdate, isChineseUI]);

    const panelContent = useMemo(() => {
        if (errorMessage) {
            return <div className='text-[13px] leading-6 text-danger-600'>{errorMessage}</div>;
        }

        if (!body.trim()) {
            return (
                <div className='text-[13px] leading-6 text-default-600'>
                    {getLocalizedDefaultValue(
                        isChineseUI,
                        '这次更新暂未提供额外说明，你可以直接开始安装。',
                        'No additional notes were provided for this release. You can start the update directly.'
                    )}
                </div>
            );
        }

        return <MarkdownContent body={body} />;
    }, [body, errorMessage, isChineseUI]);

    const primaryButtonText = isBusy
        ? isInstalling
            ? t('updater.installing')
            : t('updater.downloading')
        : t('updater.update');

    return (
        <TrayWindow
            className={osType === 'Linux' ? '' : undefined}
            style={{ background: '#f3f5f7' }}
        >
            <Toaster />
            <WindowHeader
                style={TRAY_WINDOW_HEADER_STYLE}
                center={(
                    <WindowHeaderTitle
                        icon={(
                            <img
                                src='icon.png'
                                alt='Flow Input'
                                draggable={false}
                                style={{ width: 18, height: 18 }}
                            />
                        )}
                        style={TRAY_WINDOW_TITLE_STYLE}
                        textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                    >
                        {t('updater.title')}
                    </WindowHeaderTitle>
                )}
                right={<WindowHeaderCloseButton />}
            />

            <TrayWindowBody className='px-4 py-3'>
                <TrayWindowSurface style={{ borderRadius: '18px' }}>
                    {isLatestState ? (
                        <div className='flex h-full min-h-0 flex-col overflow-hidden'>
                            <div className='grid flex-1 place-items-center px-8 text-center'>
                                <div className='max-w-[420px] text-[28px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground'>
                                    {statusCopy.headline}
                                </div>
                            </div>
                            <div className='flex shrink-0 items-center justify-end gap-3 border-t border-default-200/70 bg-default-50/40 px-6 py-4'>
                                <Button
                                    className='h-10 min-w-[96px] rounded-[12px] px-5 text-[13px] font-medium'
                                    style={TRAY_WINDOW_PRIMARY_BUTTON_STYLE}
                                    onPress={() => {
                                        appWindow.close();
                                    }}
                                >
                                    {closeButtonLabel}
                                </Button>
                            </div>
                        </div>
                    ) : isChecking ? (
                        <div className='flex h-full min-h-0 flex-col overflow-hidden'>
                            <div className='grid flex-1 place-items-center px-8 py-8'>
                                <div className='w-full max-w-[420px] text-center'>
                                    <div className='text-[26px] font-semibold tracking-[-0.02em] text-foreground'>
                                        {statusCopy.headline}
                                    </div>
                                    <div className='mt-3 text-[13px] leading-6 text-default-500'>
                                        {statusCopy.description}
                                    </div>
                                    <Progress
                                        aria-label={statusCopy.headline}
                                        isIndeterminate
                                        size='sm'
                                        classNames={{
                                            base: 'mt-8 w-full',
                                            track: 'h-2 border border-default-200/70 bg-default-100 shadow-none',
                                            indicator: 'bg-default-900',
                                        }}
                                    />
                                </div>
                            </div>
                            <div className='flex shrink-0 items-center justify-end gap-3 border-t border-default-200/70 bg-default-50/40 px-6 py-4'>
                                <Button
                                    className='h-10 min-w-[96px] rounded-[12px] px-5 text-[13px] font-medium'
                                    style={TRAY_WINDOW_PRIMARY_BUTTON_STYLE}
                                    onPress={() => {
                                        appWindow.close();
                                    }}
                                >
                                    {closeButtonLabel}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className='flex h-full min-h-0 flex-col overflow-hidden'>
                            <div className='border-b border-default-200/70 px-6 py-6'>
                                <div className='flex items-start justify-between gap-4'>
                                    <div className='min-w-0 flex-1'>
                                        <div className='inline-flex rounded-full border border-default-200/80 bg-default-50/80 px-3 py-1 text-[11px] font-medium text-default-500'>
                                            {statusCopy.badge}
                                        </div>
                                        <div className='mt-4 text-[26px] font-semibold tracking-[-0.02em] text-foreground'>
                                            {statusCopy.headline}
                                        </div>
                                        <div className='mt-2 max-w-[620px] text-[13px] leading-6 text-default-500'>
                                            {statusCopy.description}
                                        </div>
                                    </div>

                                    {hasUpdate && releaseVersion ? (
                                        <div className='shrink-0 rounded-full bg-default-100 px-3 py-1 text-[12px] font-medium text-default-600'>
                                            v{releaseVersion}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className='flex-1 min-h-0 px-6 py-5'>
                                <div className='flex h-full min-h-0 flex-col overflow-hidden'>
                                    {panelTitle ? (
                                        <div className='mb-3 text-[12px] font-medium text-default-500'>
                                            {panelTitle}
                                        </div>
                                    ) : null}
                                    <div className='phrases-inline-scroll min-h-0 flex-1 overflow-y-auto'>
                                        {panelContent}
                                    </div>
                                </div>
                            </div>

                            {isBusy ? (
                                <div className='px-6 pb-2'>
                                    <Progress
                                        aria-label={t('updater.progress')}
                                        label={t('updater.progress')}
                                        value={progressValue}
                                        showValueLabel
                                        size='sm'
                                        classNames={{
                                            base: 'w-full',
                                            track: 'border border-default-200/70 bg-default-100 shadow-none',
                                            indicator: 'bg-default-900',
                                            label: 'text-[12px] font-medium tracking-normal text-default-500',
                                            value: 'text-[12px] text-default-500',
                                        }}
                                    />
                                </div>
                            ) : null}

                            <div className='flex shrink-0 items-center justify-end gap-3 border-t border-default-200/70 bg-default-50/40 px-6 py-4'>
                                {hasUpdate ? (
                                    <>
                                        <Button
                                            variant='bordered'
                                            className='h-10 min-w-[96px] rounded-[12px] border-default-200 bg-white px-5 text-[13px] font-medium text-default-600 shadow-none'
                                            onPress={() => {
                                                appWindow.close();
                                            }}
                                        >
                                            {t('updater.cancel')}
                                        </Button>
                                        <Button
                                            isLoading={isBusy}
                                            isDisabled={isBusy}
                                            className='h-10 min-w-[116px] rounded-[12px] px-5 text-[13px] font-medium'
                                            style={TRAY_WINDOW_PRIMARY_BUTTON_STYLE}
                                            onPress={() => {
                                                installUpdate().then(
                                                    () => {
                                                        toast.success(t('updater.installed'), {
                                                            style: toastStyle,
                                                            duration: 10000,
                                                        });
                                                        relaunch();
                                                    },
                                                    (error) => {
                                                        toast.error(error.toString(), { style: toastStyle });
                                                    }
                                                );
                                            }}
                                        >
                                            {primaryButtonText}
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        className='h-10 min-w-[96px] rounded-[12px] px-5 text-[13px] font-medium'
                                        style={TRAY_WINDOW_PRIMARY_BUTTON_STYLE}
                                        onPress={() => {
                                            appWindow.close();
                                        }}
                                    >
                                        {closeButtonLabel}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </TrayWindowSurface>
            </TrayWindowBody>
        </TrayWindow>
    );
}
