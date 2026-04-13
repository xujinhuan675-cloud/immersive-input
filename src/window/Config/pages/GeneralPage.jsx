import { Tabs, Tab } from '@nextui-org/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import AdvancedSettings from './AdvancedSettings';
import GeneralSettings from './GeneralSettings';

export default function GeneralPage() {
    const { t } = useTranslation();

    return (
        <Tabs
            aria-label='general settings tabs'
            className='flex justify-center max-h-[calc(100%-40px)] overflow-y-auto'
        >
            <Tab
                key='general'
                title={t('config.general.label')}
            >
                <GeneralSettings />
            </Tab>
            <Tab
                key='advanced'
                title={t('config.advanced.label')}
            >
                <AdvancedSettings />
            </Tab>
        </Tabs>
    );
}
