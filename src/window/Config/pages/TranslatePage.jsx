import { readDir, BaseDirectory, readTextFile, exists } from '@tauri-apps/api/fs';
import { listen } from '@tauri-apps/api/event';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tabs, Tab } from '@nextui-org/react';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import React, { useEffect, useState } from 'react';

import RecognizeSettings from './Recognize';
import RecognizeServices from './Service/Recognize';
import TranslateSettings from './Translate';
import TranslateServices from './Service/Translate';
import { ServiceType } from '../../../utils/service_instance';

export default function TranslatePage() {
    const { t } = useTranslation();
    const [pluginList, setPluginList] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedTab = searchParams.get('tab') === 'recognize' ? 'recognize' : 'translate';

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
        const unlistenPromise = listen('reload_plugin_list', loadPluginList);
        return () => {
            unlistenPromise.then((fn) => {
                fn();
            });
        };
    }, []);

    return (
        pluginList !== null && (
            <Tabs
                selectedKey={selectedTab}
                aria-label='translate settings tabs'
                className='flex justify-center max-h-[calc(100%-40px)] overflow-y-auto'
                classNames={{
                    tabList: 'rounded-2xl bg-content1 p-1 shadow-sm',
                    tab: 'h-11 rounded-xl px-4 data-[hover-unselected=true]:opacity-100',
                    cursor: 'rounded-xl bg-default-100 shadow-sm',
                    panel: 'pt-4',
                    tabContent: 'group-data-[selected=true]:text-foreground text-default-500',
                }}
                onSelectionChange={(key) => {
                    const nextSearchParams = new URLSearchParams(searchParams);
                    if (key === 'recognize') {
                        nextSearchParams.set('tab', 'recognize');
                    } else {
                        nextSearchParams.delete('tab');
                    }
                    setSearchParams(nextSearchParams, { replace: true });
                }}
            >
                <Tab key='translate' title={t('config.translate.label')}>
                    <div className='mx-auto w-full max-w-[880px] space-y-4 px-1 pb-2'>
                        <TranslateSettings />
                        <TranslateServices pluginList={pluginList[ServiceType.TRANSLATE]} />
                    </div>
                </Tab>
                <Tab key='recognize' title={t('config.recognize.label')}>
                    <div className='mx-auto w-full max-w-[880px] space-y-4 px-1 pb-2'>
                        <RecognizeSettings />
                        <RecognizeServices pluginList={pluginList[ServiceType.RECOGNIZE]} />
                    </div>
                </Tab>
            </Tabs>
        )
    );
}
