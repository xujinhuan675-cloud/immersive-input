import { Button, Switch } from '@nextui-org/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { MdKeyboardArrowDown } from 'react-icons/md';

import AiProviderIcon from '../../../../../../components/AiProviderIcon';
import { useConfig } from '../../../../../../hooks';
import {
    getAiApiDisplayName,
    getAiProviderId,
    getAiProviderTitle,
    getMergedAiApiConfig,
} from '../../../../../../utils/aiConfig';
import { ConfigServiceListRow } from './ServiceRow';

export default function ServiceItem(props) {
    const { serviceInstanceKey, setCurrentConfigKey, onConfigOpen, customServicesAllowed = true, ...drag } = props;
    const { t } = useTranslation();
    const [serviceInstanceConfig, setServiceInstanceConfig] = useConfig(serviceInstanceKey, {});

    if (serviceInstanceConfig === null) {
        return <></>;
    }

    const mergedConfig = getMergedAiApiConfig(serviceInstanceConfig);
    const providerId = getAiProviderId(mergedConfig);
    const providerTitle = t(`ai_config.providers.${providerId}`, {
        defaultValue: getAiProviderTitle(providerId),
    });
    const displayName = getAiApiDisplayName(mergedConfig, providerTitle);
    const openConfig = () => {
        if (!customServicesAllowed) return;
        setCurrentConfigKey(serviceInstanceKey);
        onConfigOpen();
    };

    return (
        <ConfigServiceListRow
            dragHandleProps={drag}
            variant='list'
            icon={
                <AiProviderIcon
                    providerId={providerId}
                    className='text-[18px]'
                />
            }
            title={displayName}
            description={providerTitle}
            onPress={openConfig}
            actions={
                <>
                    <Switch
                        size='sm'
                        isDisabled={!customServicesAllowed}
                        isSelected={mergedConfig.enable ?? true}
                        onValueChange={(value) => {
                            setServiceInstanceConfig({ ...serviceInstanceConfig, enable: value });
                        }}
                    />
                    <Button
                        isIconOnly
                        size='sm'
                        variant='light'
                        className='h-8 w-8 min-w-8 rounded-md text-default-500'
                        isDisabled={!customServicesAllowed}
                        onPress={openConfig}
                    >
                        <MdKeyboardArrowDown className='rotate-[-90deg] text-[20px]' />
                    </Button>
                </>
            }
        />
    );
}
