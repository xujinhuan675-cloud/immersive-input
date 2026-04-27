import { readDir, BaseDirectory, readTextFile, exists } from '@tauri-apps/api/fs';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { atom, useAtom } from 'jotai';

import WindowHeader, {
    WindowHeaderCloseButton,
    WindowHeaderPinButton,
    WindowHeaderTitle,
} from '../../components/WindowHeader';
import { store } from '../../utils/store';
import { osType } from '../../utils/env';
import { useConfig } from '../../hooks';
import {
    RECOGNIZE_DEFAULT_VISIBLE,
    RECOGNIZE_LEGACY_DEFAULT,
    RECOGNIZE_SERVICE_CATALOG_VERSION,
    RECOGNIZE_SERVICE_PRIORITY,
    migrateRecognizeRecommendedServices,
    migrateServiceInstanceList,
} from '../Config/pages/Service/servicePriority';
import ControlArea from './ControlArea';
import ImageArea from './ImageArea';
import TextArea from './TextArea';

export const pluginListAtom = atom();
const RECOGNIZE_ACTIVE_SERVICE_INSTANCE_KEY = 'recognize_active_service_instance_key';
const RECOGNIZE_SERVICE_CATALOG_VERSION_KEY = 'recognize_service_catalog_version';

let blurTimeout = null;

const listenBlur = () => {
    return listen('tauri://blur', () => {
        if (appWindow.label === 'recognize') {
            if (blurTimeout) {
                clearTimeout(blurTimeout);
            }
            // 50ms后关闭窗口，因为在 windows 下拖动窗口时会先切换成 blur 再立即切换成 focus
            // 如果直接关闭将导致窗口无法拖动
            blurTimeout = setTimeout(async () => {
                await appWindow.close();
            }, 50);
        }
    });
};

let unlisten = listenBlur();
// 取消 blur 监听
const unlistenBlur = () => {
    unlisten.then((f) => {
        f();
    });
};

// 监听 focus 事件取消 blurTimeout 时间之内的关闭窗口
void listen('tauri://focus', () => {
    if (blurTimeout) {
        clearTimeout(blurTimeout);
    }
});

export default function Recognize() {
    const { t } = useTranslation();
    const [pluginList, setPluginList] = useAtom(pluginListAtom);
    const [closeOnBlur] = useConfig('recognize_close_on_blur', false);
    const [pined, setPined] = useState(false);
    const [serviceInstanceList, setServiceInstanceList] = useConfig(
        'recognize_service_list',
        RECOGNIZE_DEFAULT_VISIBLE
    );
    const [catalogVersion, setCatalogVersion] = useConfig(RECOGNIZE_SERVICE_CATALOG_VERSION_KEY, 0);
    const [activeServiceInstanceKey, setActiveServiceInstanceKey] = useConfig(
        RECOGNIZE_ACTIVE_SERVICE_INSTANCE_KEY,
        null
    );
    const [serviceInstanceConfigMap, setServiceInstanceConfigMap] = useState(null);

    const loadPluginList = async () => {
        let temp = {};
        if (await exists(`plugins/recognize`, { dir: BaseDirectory.AppConfig })) {
            const plugins = await readDir(`plugins/recognize`, { dir: BaseDirectory.AppConfig });
            for (const plugin of plugins) {
                const infoStr = await readTextFile(`plugins/recognize/${plugin.name}/info.json`, {
                    dir: BaseDirectory.AppConfig,
                });
                let pluginInfo = JSON.parse(infoStr);
                if ('icon' in pluginInfo) {
                    const appConfigDirPath = await appConfigDir();
                    const iconPath = await join(
                        appConfigDirPath,
                        `/plugins/recognize/${plugin.name}/${pluginInfo.icon}`
                    );
                    pluginInfo.icon = convertFileSrc(iconPath);
                }
                temp[plugin.name] = pluginInfo;
            }
        }
        setPluginList({ ...temp });
    };
    const loadServiceInstanceConfigMap = async () => {
        const config = {};
        for (const serviceInstanceKey of serviceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        setServiceInstanceConfigMap({ ...config });
    };
    useEffect(() => {
        if (serviceInstanceList === null || catalogVersion === null) {
            return;
        }

        if (catalogVersion >= RECOGNIZE_SERVICE_CATALOG_VERSION) {
            return;
        }

        let nextList = serviceInstanceList;

        if (catalogVersion < 1) {
            nextList = migrateServiceInstanceList(nextList, {
                priorityList: RECOGNIZE_SERVICE_PRIORITY,
                recommendedList: RECOGNIZE_DEFAULT_VISIBLE,
                legacyDefaultList: RECOGNIZE_LEGACY_DEFAULT,
            });
        }

        if (catalogVersion < RECOGNIZE_SERVICE_CATALOG_VERSION) {
            nextList = migrateRecognizeRecommendedServices(nextList);
        }

        const currentListJson = JSON.stringify(serviceInstanceList);
        const nextListJson = JSON.stringify(nextList);

        if (currentListJson !== nextListJson) {
            setServiceInstanceList(nextList, true);
        }

        setCatalogVersion(RECOGNIZE_SERVICE_CATALOG_VERSION, true);
    }, [catalogVersion, serviceInstanceList]);

    useEffect(() => {
        if (Array.isArray(serviceInstanceList) && serviceInstanceList.length > 0) {
            loadServiceInstanceConfigMap();
        }
    }, [serviceInstanceList, activeServiceInstanceKey]);

    useEffect(() => {
        if (Array.isArray(serviceInstanceList) && serviceInstanceList.length > 0) {
            if (!activeServiceInstanceKey || !serviceInstanceList.includes(activeServiceInstanceKey)) {
                setActiveServiceInstanceKey(serviceInstanceList[0], true);
            }
        }
    }, [serviceInstanceList, activeServiceInstanceKey]);

    useEffect(() => {
        loadPluginList();
    }, []);
    // 是否自动关闭窗口
    useEffect(() => {
        if (closeOnBlur !== null && !closeOnBlur) {
            unlistenBlur();
        }
    }, [closeOnBlur]);

    return (
        pluginList &&
        serviceInstanceConfigMap !== null && (
            <div
                className={`bg-background h-screen flex flex-col ${
                    osType === 'Linux' && 'rounded-[10px] border-1 border-default-100'
                }`}
            >
                <WindowHeader
                    left={
                        <WindowHeaderPinButton
                            active={pined}
                            onClick={() => {
                                if (pined) {
                                    if (closeOnBlur) {
                                        unlisten = listenBlur();
                                    }
                                    appWindow.setAlwaysOnTop(false);
                                } else {
                                    unlistenBlur();
                                    appWindow.setAlwaysOnTop(true);
                                }
                                setPined(!pined);
                            }}
                        />
                    }
                    center={<WindowHeaderTitle>{t('config.recognize.label')}</WindowHeaderTitle>}
                    right={<WindowHeaderCloseButton hideOnDarwin />}
                />
                <div className='flex-1 min-h-0 grid grid-cols-2'>
                    <ImageArea />
                    <TextArea serviceInstanceConfigMap={serviceInstanceConfigMap} />
                </div>
                <div className='h-[50px]'>
                    <ControlArea
                        serviceInstanceList={serviceInstanceList}
                        activeServiceInstanceKey={activeServiceInstanceKey}
                        setActiveServiceInstanceKey={setActiveServiceInstanceKey}
                        serviceInstanceConfigMap={serviceInstanceConfigMap}
                    />
                </div>
            </div>
        )
    );
}
