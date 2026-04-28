import { Button, Switch } from '@nextui-org/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuPencilLine, LuTrash2 } from 'react-icons/lu';

import AiProviderIcon from '../../../../../../components/AiProviderIcon';
import SortableConfigRow from '../../../../../../components/SortableConfigRow';
import { useConfig } from '../../../../../../hooks';
import * as builtinServices from '../../../../../../services/translate';
import {
    getAiProviderId,
    getAiProviderTitle,
    getMergedAiApiConfig,
} from '../../../../../../utils/aiConfig';
import {
    getAiTranslateDisplayName,
    getLinkedAiServiceInstanceKey,
    getMergedAiTranslateConfig,
    isAiTranslateServiceKey,
} from '../../../../../../utils/aiTranslate';
import {
    getDisplayInstanceName,
    getServiceName,
    getServiceSouceType,
    INSTANCE_NAME_CONFIG_KEY,
    ServiceSourceType,
} from '../../../../../../utils/service_instance';
import { store } from '../../../../../../utils/store';

const BUILTIN_TRANSLATE_SERVICES_WITHOUT_CONFIG = new Set([
    'bing',
    'yandex',
]);

export default function ServiceItem(props) {
    const {
        serviceInstanceKey,
        pluginList,
        deleteServiceInstance,
        setCurrentConfigKey,
        onConfigOpen,
        ...drag
    } = props;
    const { t } = useTranslation();
    const [serviceInstanceConfig, setServiceInstanceConfig] = useConfig(serviceInstanceKey, {});
    const [linkedAiConfig, setLinkedAiConfig] = useState({});

    const serviceSourceType = getServiceSouceType(serviceInstanceKey);
    const serviceName = getServiceName(serviceInstanceKey);
    const aiTranslateService = isAiTranslateServiceKey(serviceInstanceKey);

    useEffect(() => {
        if (!aiTranslateService) {
            setLinkedAiConfig({});
            return;
        }

        const mergedBindingConfig = getMergedAiTranslateConfig(serviceInstanceConfig, serviceInstanceKey);
        const linkedAiInstanceKey = getLinkedAiServiceInstanceKey(serviceInstanceKey, mergedBindingConfig);
        let cancelled = false;

        const loadLinkedAiConfig = async () => {
            await store.load();
            const nextConfig = linkedAiInstanceKey ? (await store.get(linkedAiInstanceKey)) ?? {} : {};
            if (!cancelled) {
                setLinkedAiConfig(nextConfig);
            }
        };

        void loadLinkedAiConfig();
        return () => {
            cancelled = true;
        };
    }, [aiTranslateService, serviceInstanceConfig, serviceInstanceKey]);

    if (serviceSourceType === ServiceSourceType.PLUGIN && !(serviceName in pluginList)) {
        return <></>;
    }

    if (serviceInstanceConfig === null) {
        return <></>;
    }

    if (aiTranslateService) {
        const mergedBindingConfig = getMergedAiTranslateConfig(serviceInstanceConfig, serviceInstanceKey);
        const mergedAiConfig = getMergedAiApiConfig(linkedAiConfig ?? {});
        const providerId = getAiProviderId(mergedAiConfig);
        const providerTitle = t(`ai_config.providers.${providerId}`, {
            defaultValue: getAiProviderTitle(providerId),
        });
        const displayName = getAiTranslateDisplayName(
            mergedBindingConfig,
            mergedAiConfig,
            t('ai_config.translate_service_title', { defaultValue: 'AI Translate' })
        );

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
                            isSelected={mergedBindingConfig.enable ?? true}
                            onValueChange={(value) => {
                                setServiceInstanceConfig({
                                    ...mergedBindingConfig,
                                    enable: value,
                                    hidden: false,
                                });
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

    const isBuiltin = serviceSourceType === ServiceSourceType.BUILDIN;
    if (isBuiltin && !(serviceName in builtinServices)) {
        return <></>;
    }

    const pluginNeeds = Array.isArray(pluginList?.[serviceName]?.needs) ? pluginList[serviceName].needs : [];
    const canEditConfig = isBuiltin
        ? !BUILTIN_TRANSLATE_SERVICES_WITHOUT_CONFIG.has(serviceName)
        : pluginNeeds.length > 0;
    const displayName = isBuiltin
        ? getDisplayInstanceName(
              serviceInstanceConfig[INSTANCE_NAME_CONFIG_KEY],
              () => t(`services.translate.${serviceName}.title`)
          )
        : getDisplayInstanceName(
              serviceInstanceConfig[INSTANCE_NAME_CONFIG_KEY],
              () => pluginList[serviceName].display
          );

    return (
        <SortableConfigRow
            dragHandleProps={drag}
            icon={
                <img
                    src={
                        isBuiltin
                            ? `${builtinServices[serviceName].info.icon}`
                            : pluginList[serviceName].icon
                    }
                    className='h-5 w-5 object-contain'
                    draggable={false}
                />
            }
            title={displayName}
            description={isBuiltin ? null : t('common.plugin')}
            actions={
                <>
                    <Switch
                        size='sm'
                        isSelected={serviceInstanceConfig.enable ?? true}
                        onValueChange={(value) => {
                            setServiceInstanceConfig({ ...serviceInstanceConfig, enable: value });
                        }}
                    />
                    {canEditConfig ? (
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
                    ) : null}
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
