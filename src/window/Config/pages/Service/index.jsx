import { readDir, BaseDirectory, readTextFile, exists } from '@tauri-apps/api/fs';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { Tabs, Tab } from '@nextui-org/react';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import React, { useEffect, useState } from 'react';
import {
    LuBookMarked,
    LuBrainCircuit,
    LuFileSearch,
    LuLanguages,
    LuVolume2,
} from 'react-icons/lu';
import Translate from './Translate';
import Recognize from './Recognize';
import Collection from './Collection';
import Tts from './Tts';
import AIConfig from './AIConfig';
import { ServiceType } from '../../../../utils/service_instance';

let unlisten = null;

function ServiceTabTitle({ icon: Icon, label }) {
    return (
        <div className='inline-flex items-center gap-2'>
            <div className='flex h-6 w-6 items-center justify-center rounded-full bg-default-100 text-default-500'>
                <Icon size={14} />
            </div>
            <span>{label}</span>
        </div>
    );
}

export default function Service() {
    const [pluginList, setPluginList] = useState(null);
    const { t } = useTranslation();

    const loadPluginList = async () => {
        const serviceTypeList = ['translate', 'tts', 'recognize', 'collection'];
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
        if (unlisten) {
            unlisten.then((f) => {
                f();
            });
        }
        unlisten = listen('reload_plugin_list', loadPluginList);
        return () => {
            if (unlisten) {
                unlisten.then((f) => {
                    f();
                });
            }
        };
    }, []);
    return (
        pluginList !== null && (
            <Tabs
                className='flex justify-center max-h-[calc(100%-40px)] overflow-y-auto'
                classNames={{
                    tabList: 'rounded-2xl bg-content1 p-1 shadow-sm',
                    tab: 'h-11 rounded-xl px-4 data-[hover-unselected=true]:opacity-100',
                    cursor: 'rounded-xl bg-default-100 shadow-sm',
                    panel: 'pt-4',
                    tabContent: 'group-data-[selected=true]:text-foreground text-default-500',
                }}
            >
                <Tab
                    key='translate'
                    title={
                        <ServiceTabTitle
                            icon={LuLanguages}
                            label={t(`config.service.translate`)}
                        />
                    }
                >
                    <Translate pluginList={pluginList[ServiceType.TRANSLATE]} />
                </Tab>
                <Tab
                    key='recognize'
                    title={
                        <ServiceTabTitle
                            icon={LuFileSearch}
                            label={t(`config.service.recognize`)}
                        />
                    }
                >
                    <Recognize pluginList={pluginList[ServiceType.RECOGNIZE]} />
                </Tab>
                <Tab
                    key='tts'
                    title={
                        <ServiceTabTitle
                            icon={LuVolume2}
                            label={t(`config.service.tts`)}
                        />
                    }
                >
                    <Tts pluginList={pluginList[ServiceType.TTS]} />
                </Tab>
                <Tab
                    key='collection'
                    title={
                        <ServiceTabTitle
                            icon={LuBookMarked}
                            label={t(`config.service.collection`)}
                        />
                    }
                >
                    <Collection pluginList={pluginList[ServiceType.COLLECTION]} />
                </Tab>
                <Tab
                    key='ai_api'
                    title={
                        <ServiceTabTitle
                            icon={LuBrainCircuit}
                            label={t('ai_config.title', { defaultValue: 'AI API' })}
                        />
                    }
                >
                    <AIConfig />
                </Tab>
            </Tabs>
        )
    );
}
