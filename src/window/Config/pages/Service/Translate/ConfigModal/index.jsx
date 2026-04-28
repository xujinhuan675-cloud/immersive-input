import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Spacer } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { LuBrainCircuit } from 'react-icons/lu';

import * as builtinServices from '../../../../../../services/translate';
import { isAiTranslateServiceKey } from '../../../../../../utils/aiTranslate';
import { PluginConfig } from '../../PluginConfig';
import { ServiceSourceType, getServiceName, getServiceSouceType, whetherPluginService } from '../../../../../../utils/service_instance';
import AiTranslateConfig from './AiTranslateConfig';

export default function ConfigModal(props) {
    const { serviceInstanceKey, pluginList, isOpen, onOpenChange, updateServiceInstanceList } = props;

    const serviceSourceType = getServiceSouceType(serviceInstanceKey);
    const pluginServiceFlag = whetherPluginService(serviceInstanceKey);
    const serviceName = getServiceName(serviceInstanceKey);
    const aiTranslateService = isAiTranslateServiceKey(serviceInstanceKey);

    const { t } = useTranslation();
    if (!aiTranslateService && !pluginServiceFlag && !(serviceName in builtinServices)) {
        return <></>;
    }

    const ConfigComponent = aiTranslateService
        ? AiTranslateConfig
        : pluginServiceFlag
          ? PluginConfig
          : builtinServices[serviceName].Config;

    return pluginServiceFlag && !(serviceName in pluginList) ? (
        <></>
    ) : (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            scrollBehavior='inside'
        >
            <ModalContent className='max-h-[75vh]'>
                {(onClose) => (
                    <>
                        <ModalHeader>
                            {aiTranslateService && (
                                <>
                                    <div className='flex h-[24px] w-[24px] items-center justify-center rounded-full bg-primary-100 text-primary'>
                                        <LuBrainCircuit className='text-[14px]' />
                                    </div>
                                    <Spacer x={2} />
                                    {t('ai_config.translate_service_title', { defaultValue: 'AI Translate' })}
                                </>
                            )}
                            {!aiTranslateService && serviceSourceType === ServiceSourceType.BUILDIN && (
                                <>
                                    <img
                                        src={builtinServices[serviceName].info.icon}
                                        className='h-[24px] w-[24px] my-auto'
                                        draggable={false}
                                    />
                                    <Spacer x={2} />
                                    {t(`services.translate.${serviceName}.title`)}
                                </>
                            )}
                            {pluginServiceFlag && (
                                <>
                                    <img
                                        src={pluginList[serviceName].icon}
                                        className='h-[24px] w-[24px] my-auto'
                                        draggable={false}
                                    />

                                    <Spacer x={2} />
                                    {`${pluginList[serviceName].display} [${t('common.plugin')}]`}
                                </>
                            )}
                        </ModalHeader>
                        <ModalBody>
                            <ConfigComponent
                                name={serviceName}
                                instanceKey={serviceInstanceKey}
                                pluginType='translate'
                                pluginList={pluginList}
                                updateServiceList={updateServiceInstanceList}
                                onClose={onClose}
                            />
                        </ModalBody>
                        {!aiTranslateService ? (
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
