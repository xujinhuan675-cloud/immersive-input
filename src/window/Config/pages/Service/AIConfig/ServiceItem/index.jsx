import { Switch } from '@nextui-org/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { LuPencilLine, LuTrash2 } from 'react-icons/lu';

import AiProviderIcon from '../../../../../../components/AiProviderIcon';
import { useConfig } from '../../../../../../hooks';
import {
    getAiApiDisplayName,
    getAiProviderId,
    getAiProviderTitle,
    getMergedAiApiConfig,
} from '../../../../../../utils/aiConfig';
import { ConfigServiceIconButton, ConfigServiceListRow } from './ServiceRow';

export default function ServiceItem(props) {
    const {
        serviceInstanceKey,
        deleteServiceInstance,
        setCurrentConfigKey,
        onConfigOpen,
        customServicesAllowed = true,
        ...drag
    } = props;
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

    return (
        <ConfigServiceListRow
            dragHandleProps={drag}
            icon={<AiProviderIcon providerId={providerId} className='text-[18px]' />}
            title={displayName}
            description={providerTitle}
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
                    <ConfigServiceIconButton
                        isDisabled={!customServicesAllowed}
                        onPress={() => {
                            if (!customServicesAllowed) return;
                            setCurrentConfigKey(serviceInstanceKey);
                            onConfigOpen();
                        }}
                    >
                        <LuPencilLine className='text-[18px]' />
                    </ConfigServiceIconButton>
                    <ConfigServiceIconButton
                        color='danger'
                        isDisabled={!customServicesAllowed}
                        onPress={() => {
                            if (!customServicesAllowed) return;
                            deleteServiceInstance(serviceInstanceKey);
                        }}
                    >
                        <LuTrash2 className='text-[18px]' />
                    </ConfigServiceIconButton>
                </>
            }
        />
    );
}
