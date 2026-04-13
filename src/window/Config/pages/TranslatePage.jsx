import { Tabs, Tab } from '@nextui-org/react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import React from 'react';

import Recognize from './Recognize';
import Translate from './Translate';

export default function TranslatePage() {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedTab = searchParams.get('tab') === 'recognize' ? 'recognize' : 'translate';

    return (
        <Tabs
            selectedKey={selectedTab}
            aria-label='translate settings tabs'
            className='flex justify-center max-h-[calc(100%-40px)] overflow-y-auto'
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
            <Tab
                key='translate'
                title={t('config.translate.label')}
            >
                <Translate />
            </Tab>
            <Tab
                key='recognize'
                title={t('config.recognize.label')}
            >
                <Recognize />
            </Tab>
        </Tabs>
    );
}
