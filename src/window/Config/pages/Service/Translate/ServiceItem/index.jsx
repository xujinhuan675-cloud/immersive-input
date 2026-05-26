import { Button, Switch } from '@nextui-org/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdKeyboardArrowDown } from 'react-icons/md';

import AiProviderIcon from '../../../../../../components/AiProviderIcon';
import SortableConfigRow from '../../../../../../components/SortableConfigRow';
import { useConfig } from '../../../../../../hooks';
import * as builtinServices from '../../../../../../services/translate';
import { getAiProviderId, getAiProviderTitle, getMergedAiApiConfig } from '../../../../../../utils/aiConfig';
import {
    getLinkedAiServiceInstanceKey,
    getMergedAiTranslateConfig,
    isAiTranslateServiceKey,
} from '../../../../../../utils/aiTranslate';
import { getServiceName, getServiceSouceType, ServiceSourceType } from '../../../../../../utils/service_instance';
import { store } from '../../../../../../utils/store';
import { TranslateConfigPanel } from '../ConfigModal';

const BUILTIN_TRANSLATE_SERVICES_WITHOUT_CONFIG = new Set(['bing', 'yandex']);

export default function ServiceItem(props) {
    const { serviceInstanceKey, pluginList, deleteServiceInstance, updateServiceInstanceList, ...drag } = props;
    const { t } = useTranslation();
    const [serviceInstanceConfig, setServiceInstanceConfig] = useConfig(serviceInstanceKey, {});
    const [linkedAiConfig, setLinkedAiConfig] = useState({});
    const [expanded, setExpanded] = useState(false);

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

    const toggleExpanded = () => setExpanded((value) => !value);
    const closeExpanded = () => setExpanded(false);
    const deleteServiceLabel = t('config.service.delete_service', { defaultValue: 'Delete service' });
    const renderDeleteButton = () => (
        <Button
            type='button'
            size='sm'
            variant='light'
            color='danger'
            className='h-8 px-3 text-[13px] font-medium'
            onPress={() => {
                deleteServiceInstance(serviceInstanceKey);
                closeExpanded();
            }}
        >
            {deleteServiceLabel}
        </Button>
    );
    const renderFallbackFooter = () => (
        <div className='flex items-center justify-between border-t border-default-100 pt-3'>
            {renderDeleteButton()}
            <Button
                size='sm'
                variant='light'
                className='h-8 px-3 text-[13px] font-medium text-default-600'
                onPress={closeExpanded}
            >
                {t('common.cancel')}
            </Button>
        </div>
    );
    const renderActions = (isSelected, onValueChange) => (
        <>
            <Switch
                size='sm'
                isSelected={isSelected}
                onValueChange={onValueChange}
            />
            <Button
                isIconOnly
                size='sm'
                variant='light'
                className='h-8 w-8 min-w-8 rounded-md text-default-500'
                onPress={toggleExpanded}
            >
                <MdKeyboardArrowDown className={`text-[20px] transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </Button>
        </>
    );
    const renderExpandedContent = (showConfig = true) => {
        const configHandlesDeleteAction = !aiTranslateService && serviceName === 'deepl';

        return (
            <div className='space-y-4'>
                {showConfig ? (
                    <TranslateConfigPanel
                        serviceInstanceKey={serviceInstanceKey}
                        pluginList={pluginList}
                        updateServiceInstanceList={updateServiceInstanceList ?? (() => {})}
                        onClose={closeExpanded}
                        deleteAction={configHandlesDeleteAction ? renderDeleteButton() : null}
                    />
                ) : null}
                {!showConfig || !configHandlesDeleteAction ? renderFallbackFooter() : null}
            </div>
        );
    };

    if (aiTranslateService) {
        const mergedBindingConfig = getMergedAiTranslateConfig(serviceInstanceConfig, serviceInstanceKey);
        const mergedAiConfig = getMergedAiApiConfig(linkedAiConfig ?? {});
        const providerId = getAiProviderId(mergedAiConfig);
        const providerTitle = t(`ai_config.providers.${providerId}`, {
            defaultValue: getAiProviderTitle(providerId),
        });
        const displayName = providerTitle;

        return (
            <SortableConfigRow
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
                expanded={expanded}
                onPress={toggleExpanded}
                actions={renderActions(mergedBindingConfig.enable ?? true, (value) => {
                    setServiceInstanceConfig({
                        ...mergedBindingConfig,
                        enable: value,
                        hidden: false,
                    });
                })}
            >
                {expanded ? renderExpandedContent(true) : null}
            </SortableConfigRow>
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
    const displayName = isBuiltin ? t(`services.translate.${serviceName}.title`) : pluginList[serviceName].display;

    return (
        <SortableConfigRow
            dragHandleProps={drag}
            variant='list'
            icon={
                <img
                    src={isBuiltin ? `${builtinServices[serviceName].info.icon}` : pluginList[serviceName].icon}
                    className='h-5 w-5 object-contain'
                    draggable={false}
                />
            }
            title={displayName}
            description={isBuiltin ? null : t('common.plugin')}
            expanded={expanded}
            onPress={toggleExpanded}
            actions={renderActions(serviceInstanceConfig.enable ?? true, (value) => {
                setServiceInstanceConfig({ ...serviceInstanceConfig, enable: value });
            })}
        >
            {expanded ? renderExpandedContent(canEditConfig) : null}
        </SortableConfigRow>
    );
}
