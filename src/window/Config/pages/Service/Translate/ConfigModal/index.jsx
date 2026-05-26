import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Spacer } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { LuBrainCircuit } from 'react-icons/lu';

import * as builtinServices from '../../../../../../services/translate';
import { isAiTranslateServiceKey } from '../../../../../../utils/aiTranslate';
import { PluginConfig } from '../../PluginConfig';
import {
    ServiceSourceType,
    getServiceName,
    getServiceSouceType,
    whetherPluginService,
} from '../../../../../../utils/service_instance';
import AiTranslateConfig from './AiTranslateConfig';

function TranslatePluginConfig(props) {
    return (
        <PluginConfig
            {...props}
            hideInstanceName
        />
    );
}

export function getTranslateConfigMeta(serviceInstanceKey, pluginList, t) {
    const serviceSourceType = getServiceSouceType(serviceInstanceKey);
    const pluginServiceFlag = whetherPluginService(serviceInstanceKey);
    const serviceName = getServiceName(serviceInstanceKey);
    const aiTranslateService = isAiTranslateServiceKey(serviceInstanceKey);

    if (!aiTranslateService && !pluginServiceFlag && !(serviceName in builtinServices)) {
        return null;
    }

    const ConfigComponent = aiTranslateService
        ? AiTranslateConfig
        : pluginServiceFlag
          ? TranslatePluginConfig
          : builtinServices[serviceName].Config;

    if (pluginServiceFlag && !(serviceName in pluginList)) {
        return null;
    }

    const title = aiTranslateService
        ? t('ai_config.translate_service_title', { defaultValue: 'AI Translate' })
        : pluginServiceFlag
          ? `${pluginList[serviceName].display} [${t('common.plugin')}]`
          : t(`services.translate.${serviceName}.title`);
    const icon = aiTranslateService ? (
        <div className='flex h-[24px] w-[24px] items-center justify-center rounded-full bg-primary-100 text-primary'>
            <LuBrainCircuit className='text-[14px]' />
        </div>
    ) : pluginServiceFlag ? (
        <img
            src={pluginList[serviceName].icon}
            className='h-[24px] w-[24px] my-auto'
            draggable={false}
        />
    ) : (
        <img
            src={builtinServices[serviceName].info.icon}
            className='h-[24px] w-[24px] my-auto'
            draggable={false}
        />
    );

    return {
        serviceName,
        serviceSourceType,
        pluginServiceFlag,
        aiTranslateService,
        ConfigComponent,
        title,
        icon,
    };
}

export function TranslateConfigPanel(props) {
    const { serviceInstanceKey, pluginList, updateServiceInstanceList, onClose, deleteAction } = props;
    const { t } = useTranslation();
    const meta = getTranslateConfigMeta(serviceInstanceKey, pluginList, t);

    if (!meta) return null;

    const { serviceName, ConfigComponent } = meta;

    return (
        <ConfigComponent
            name={serviceName}
            instanceKey={serviceInstanceKey}
            pluginType='translate'
            pluginList={pluginList}
            updateServiceList={updateServiceInstanceList}
            onClose={onClose}
            deleteAction={deleteAction}
        />
    );
}

export default function ConfigModal(props) {
    const { serviceInstanceKey, pluginList, isOpen, onOpenChange, updateServiceInstanceList } = props;
    const { t } = useTranslation();
    const meta = getTranslateConfigMeta(serviceInstanceKey, pluginList, t);

    if (!meta) return <></>;

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            scrollBehavior='inside'
        >
            <ModalContent className='max-h-[75vh]'>
                {(onClose) => (
                    <>
                        <ModalHeader>
                            {meta.icon}
                            <Spacer x={2} />
                            {meta.title}
                        </ModalHeader>
                        <ModalBody>
                            <TranslateConfigPanel
                                serviceInstanceKey={serviceInstanceKey}
                                pluginList={pluginList}
                                updateServiceInstanceList={updateServiceInstanceList}
                                onClose={onClose}
                            />
                        </ModalBody>
                        {!meta.aiTranslateService ? (
                            <ModalFooter>
                                <Button
                                    color='danger'
                                    variant='light'
                                    onPress={onClose}
                                >
                                    {t('common.cancel')}
                                </Button>
                            </ModalFooter>
                        ) : null}
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
