import { Button, Switch } from '@nextui-org/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { LuPencilLine, LuTrash2 } from 'react-icons/lu';

import AiProviderIcon from '../../../../../../components/AiProviderIcon';
import SortableConfigRow from '../../../../../../components/SortableConfigRow';
import { useConfig } from '../../../../../../hooks';
import {
    getAiApiDisplayName,
    getAiProviderId,
    getAiProviderTitle,
    getMergedAiApiConfig,
} from '../../../../../../utils/aiConfig';

export default function ServiceItem(props) {
    const {
        serviceInstanceKey,
        deleteServiceInstance,
        setCurrentConfigKey,
        onConfigOpen,
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
        <SortableConfigRow
            dragHandleProps={drag}
            icon={<AiProviderIcon providerId={providerId} className='text-[18px]' />}
            title={displayName}
            description={providerTitle}
            actions={
                <>
                    <Switch
                        size='sm'
                        isSelected={mergedConfig.enable ?? true}
                        onValueChange={(value) => {
                            setServiceInstanceConfig({ ...serviceInstanceConfig, enable: value });
                        }}
                    />
                    <Button
                        isIconOnly
                        size='sm'
                        variant='light'
                        className='text-default-500'
                        onPress={() => {
                            setCurrentConfigKey(serviceInstanceKey);
                            onConfigOpen();
                        }}
                    >
                        <LuPencilLine className='text-[18px]' />
                    </Button>
                    <Button
                        isIconOnly
                        size='sm'
                        variant='light'
                        color='danger'
                        onPress={() => {
                            deleteServiceInstance(serviceInstanceKey);
                        }}
                    >
                        <LuTrash2 className='text-[18px]' />
                    </Button>
                </>
            }
        />
    );
}
