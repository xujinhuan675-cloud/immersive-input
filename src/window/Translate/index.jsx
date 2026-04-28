import { readDir, BaseDirectory, readTextFile, exists } from '@tauri-apps/api/fs';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { invoke } from '@tauri-apps/api';
import { appWindow } from '@tauri-apps/api/window';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import React, { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { HiTranslate } from 'react-icons/hi';

import WindowHeader, {
    WindowHeaderCloseButton,
    WindowHeaderPinButton,
    WindowHeaderTitle,
} from '../../components/WindowHeader';
import {
    TRAY_WINDOW_HEADER_STYLE,
    TRAY_WINDOW_TITLE_STYLE,
    TRAY_WINDOW_TITLE_TEXT_STYLE,
    TrayWindow,
    TrayWindowBody,
} from '../../components/TrayWindow';
import LanguageArea from './components/LanguageArea';
import SourceArea from './components/SourceArea';
import TargetArea from './components/TargetArea';
import { useConfig } from '../../hooks';
import { AI_API_SERVICE_LIST_KEY } from '../../utils/aiConfig';
import {
    ensureAiTranslateBindings,
    getLinkedAiServiceInstanceKey,
    isAiTranslateServiceKey,
} from '../../utils/aiTranslate';
import { store } from '../../utils/store';
import {
    RECOGNIZE_DEFAULT_VISIBLE,
    TRANSLATE_DEFAULT_VISIBLE,
    TRANSLATE_SERVICE_CATALOG_VERSION,
    migrateTranslateRecommendedServices,
} from '../Config/pages/Service/servicePriority';

let blurTimeout = null;
let unlisten = null;
const TRANSLATE_SERVICE_CATALOG_VERSION_KEY = 'translate_service_catalog_version';

const listenBlur = () => {
    return listen('tauri://blur', () => {
        if (appWindow.label === 'translate') {
            if (blurTimeout) {
                clearTimeout(blurTimeout);
            }
            // 100ms后关闭窗口，因为在 windows 下拖动窗口时会先切换成 blur 再立即切换成 focus
            // 如果直接关闭将导致窗口无法拖动
            // 800ms 超时给前端足够时间加载并调用 appWindow.setFocus()
            // 从而取消关闭定时器；也给用户时间单击窗口以保持其打开
            blurTimeout = setTimeout(async () => {
                await appWindow.close();
            }, 800);
        }
    });
};

const ensureBlurListener = () => {
    if (!unlisten) {
        unlisten = listenBlur();
    }
};

ensureBlurListener();
// 取消 blur 监听
const unlistenBlur = () => {
    if (!unlisten) {
        return;
    }

    const current = unlisten;
    unlisten = null;
    current.then((f) => {
        f();
    });
};

// 监听 focus 事件取消 blurTimeout 时间之内的关闭窗口
void listen('tauri://focus', () => {
    if (blurTimeout) {
        clearTimeout(blurTimeout);
    }
});
// 监听 move 事件取消 blurTimeout 时间之内的关闭窗口
void listen('tauri://move', () => {
    if (blurTimeout) {
        clearTimeout(blurTimeout);
    }
});

export default function Translate() {
    const { t } = useTranslation();
    const [translateServiceInstanceList, setTranslateServiceInstanceList] = useConfig(
        'translate_service_list',
        TRANSLATE_DEFAULT_VISIBLE
    );
    const [translateCatalogVersion, setTranslateCatalogVersion] = useConfig(TRANSLATE_SERVICE_CATALOG_VERSION_KEY, 0);
    const [aiApiServiceInstanceList] = useConfig(AI_API_SERVICE_LIST_KEY, []);
    const [recognizeServiceInstanceList] = useConfig('recognize_service_list', RECOGNIZE_DEFAULT_VISIBLE);
    const [closeOnBlur] = useConfig('translate_close_on_blur', false);
    const [alwaysOnTop] = useConfig('translate_always_on_top', false);
    const [hideLanguage] = useConfig('hide_language', false);
    const [excerptTranslationDefault] = useConfig('incremental_translate', false);
    const [pined, setPined] = useState(false);
    const [excerptMode, setExcerptMode] = useState(false);
    const [pluginList, setPluginList] = useState(null);
    const [serviceInstanceConfigMap, setServiceInstanceConfigMap] = useState(null);
    const hasHydratedExcerptMode = useRef(false);
    const isWindowFixed = pined || excerptMode;
    const reorder = (list, startIndex, endIndex) => {
        const result = Array.from(list);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return result;
    };

    const onDragEnd = async (result) => {
        if (!result.destination) return;
        const items = reorder(translateServiceInstanceList, result.source.index, result.destination.index);
        setTranslateServiceInstanceList(items);
    };
    // 是否自动关闭窗口
    useEffect(() => {
        if (closeOnBlur === null) {
            return;
        }

        if (excerptMode) {
            unlistenBlur();
        } else if (closeOnBlur) {
            ensureBlurListener();
        } else {
            unlistenBlur();
        }
    }, [closeOnBlur, excerptMode]);
    // 是否默认置顶
    useEffect(() => {
        if (alwaysOnTop === null) {
            return;
        }

        if (alwaysOnTop) {
            appWindow.setAlwaysOnTop(true);
            unlistenBlur();
            setPined(true);
        } else if (!pined) {
            appWindow.setAlwaysOnTop(false);
            if (closeOnBlur && !excerptMode) {
                ensureBlurListener();
            }
        }
    }, [alwaysOnTop, closeOnBlur, excerptMode, pined]);

    useEffect(() => {
        if (excerptTranslationDefault === null || hasHydratedExcerptMode.current) {
            return;
        }

        setExcerptMode(Boolean(excerptTranslationDefault));
        hasHydratedExcerptMode.current = true;
    }, [excerptTranslationDefault]);

    useEffect(() => {
        invoke('set_translate_excerpt_mode', { enabled: excerptMode }).catch(() => {});
    }, [excerptMode]);

    useEffect(() => {
        if (
            translateServiceInstanceList === null ||
            translateCatalogVersion === null ||
            aiApiServiceInstanceList === null
        ) {
            return;
        }

        let cancelled = false;

        const syncTranslateServiceList = async () => {
            const migratedList = migrateTranslateRecommendedServices(translateServiceInstanceList);
            const { nextList } = await ensureAiTranslateBindings(
                migratedList,
                aiApiServiceInstanceList,
                {
                    legacySourceList: translateServiceInstanceList,
                }
            );

            if (cancelled) {
                return;
            }

            if (JSON.stringify(nextList) !== JSON.stringify(translateServiceInstanceList)) {
                setTranslateServiceInstanceList(nextList, true);
            }

            if (translateCatalogVersion < TRANSLATE_SERVICE_CATALOG_VERSION) {
                setTranslateCatalogVersion(TRANSLATE_SERVICE_CATALOG_VERSION, true);
            }
        };

        void syncTranslateServiceList();
        return () => {
            cancelled = true;
        };
    }, [translateServiceInstanceList, translateCatalogVersion, aiApiServiceInstanceList]);

    useEffect(() => {
        return () => {
            invoke('set_translate_excerpt_mode', { enabled: false }).catch(() => {});
        };
    }, []);
    const loadPluginList = async () => {
        const serviceTypeList = ['translate', 'recognize'];
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

    useEffect(() => {
        loadPluginList();
        if (!unlisten) {
            unlisten = listen('reload_plugin_list', loadPluginList);
        }
    }, []);

    const loadServiceInstanceConfigMap = async () => {
        const config = {};
        for (const serviceInstanceKey of translateServiceInstanceList) {
            const serviceInstanceConfig = (await store.get(serviceInstanceKey)) ?? {};
            config[serviceInstanceKey] = serviceInstanceConfig;
            if (isAiTranslateServiceKey(serviceInstanceKey)) {
                const linkedAiInstanceKey = getLinkedAiServiceInstanceKey(
                    serviceInstanceKey,
                    serviceInstanceConfig
                );
                if (linkedAiInstanceKey) {
                    config[linkedAiInstanceKey] = (await store.get(linkedAiInstanceKey)) ?? {};
                }
            }
        }
        for (const serviceInstanceKey of recognizeServiceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        setServiceInstanceConfigMap({ ...config });
    };
    useEffect(() => {
        if (
            translateServiceInstanceList !== null &&
            recognizeServiceInstanceList !== null &&
            aiApiServiceInstanceList !== null
        ) {
            loadServiceInstanceConfigMap();
        }
    }, [translateServiceInstanceList, recognizeServiceInstanceList, aiApiServiceInstanceList]);

    return (
        pluginList && (
            <TrayWindow>
                <WindowHeader
                    style={TRAY_WINDOW_HEADER_STYLE}
                    centerStyle={{ justifyContent: 'flex-start' }}
                    center={
                        <WindowHeaderTitle
                            icon={<HiTranslate className='text-[15px] text-default-500' />}
                            style={TRAY_WINDOW_TITLE_STYLE}
                            textStyle={TRAY_WINDOW_TITLE_TEXT_STYLE}
                        >
                            {t('translate.translate')}
                        </WindowHeaderTitle>
                    }
                    right={
                        <div className='flex items-center gap-1.5'>
                            <WindowHeaderPinButton
                                active={isWindowFixed}
                                onClick={() => {
                                    if (pined) {
                                        if (closeOnBlur && !excerptMode) {
                                            ensureBlurListener();
                                        }
                                        appWindow.setAlwaysOnTop(false);
                                    } else {
                                        unlistenBlur();
                                        appWindow.setAlwaysOnTop(true);
                                    }
                                    setPined(!pined);
                                }}
                            />
                            <WindowHeaderCloseButton hideOnDarwin />
                        </div>
                    }
                />
                <TrayWindowBody className='overflow-y-auto'>
                    <div className='mx-auto flex min-h-full max-w-[980px] flex-col gap-1.5'>
                        <div>
                            {serviceInstanceConfigMap !== null && (
                                <SourceArea
                                    pluginList={pluginList}
                                    serviceInstanceConfigMap={serviceInstanceConfigMap}
                                    excerptMode={excerptMode}
                                    setExcerptMode={setExcerptMode}
                                />
                            )}
                        </div>
                        <div className={`${hideLanguage && 'hidden'}`}>
                            <LanguageArea />
                        </div>
                        <DragDropContext onDragEnd={onDragEnd}>
                            <Droppable
                                droppableId='droppable'
                                direction='vertical'
                            >
                                {(provided) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className='space-y-1.5'
                                    >
                                        {translateServiceInstanceList !== null &&
                                            serviceInstanceConfigMap !== null &&
                                            translateServiceInstanceList.map((serviceInstanceKey, index) => {
                                                const config = serviceInstanceConfigMap[serviceInstanceKey] ?? {};
                                                const enable = config['enable'] ?? true;

                                                return enable ? (
                                                    <Draggable
                                                        key={serviceInstanceKey}
                                                        draggableId={serviceInstanceKey}
                                                        index={index}
                                                    >
                                                        {(provided) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                            >
                                                                <TargetArea
                                                                    {...provided.dragHandleProps}
                                                                    index={index}
                                                                    name={serviceInstanceKey}
                                                                    translateServiceInstanceList={
                                                                        translateServiceInstanceList
                                                                    }
                                                                    pluginList={pluginList}
                                                                    serviceInstanceConfigMap={serviceInstanceConfigMap}
                                                                />
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ) : (
                                                    <></>
                                                );
                                            })}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    </div>
                </TrayWindowBody>
            </TrayWindow>
        )
    );
}
