import { readDir, BaseDirectory, readTextFile, exists } from '@tauri-apps/api/fs';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { appWindow } from '@tauri-apps/api/window';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import React, { useState, useEffect } from 'react';
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
import { store } from '../../utils/store';

let blurTimeout = null;
let unlisten = null;

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
    const [translateServiceInstanceList, setTranslateServiceInstanceList] = useConfig('translate_service_list', [
        'deepl',
        'bing',
        'lingva',
        'yandex',
        'google',
        'ecdict',
    ]);
    const [recognizeServiceInstanceList] = useConfig('recognize_service_list', ['system', 'tesseract']);
    const [closeOnBlur] = useConfig('translate_close_on_blur', false);
    const [alwaysOnTop] = useConfig('translate_always_on_top', false);
    const [hideLanguage] = useConfig('hide_language', false);
    const [pined, setPined] = useState(false);
    const [pluginList, setPluginList] = useState(null);
    const [serviceInstanceConfigMap, setServiceInstanceConfigMap] = useState(null);
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

        if (closeOnBlur) {
            ensureBlurListener();
        } else {
            unlistenBlur();
        }
    }, [closeOnBlur]);
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
            if (closeOnBlur) {
                ensureBlurListener();
            }
        }
    }, [alwaysOnTop, closeOnBlur, pined]);
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
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        for (const serviceInstanceKey of recognizeServiceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        setServiceInstanceConfigMap({ ...config });
    };
    useEffect(() => {
        if (translateServiceInstanceList !== null && recognizeServiceInstanceList !== null) {
            loadServiceInstanceConfigMap();
        }
    }, [translateServiceInstanceList, recognizeServiceInstanceList]);

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
                                active={pined}
                                onClick={() => {
                                    if (pined) {
                                        if (closeOnBlur) {
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
