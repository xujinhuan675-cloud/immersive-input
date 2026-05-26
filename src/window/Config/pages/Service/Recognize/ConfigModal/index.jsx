import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Spacer } from '@nextui-org/react';

import { useTranslation } from 'react-i18next';
import React from 'react';

import {
    ServiceSourceType,
    getServiceName,
    getServiceSouceType,
    whetherPluginService,
} from '../../../../../../utils/service_instance';
import * as builtinServices from '../../../../../../services/recognize';
import { osType } from '../../../../../../utils/env';
import { PluginConfig } from '../../PluginConfig';

function RecognizePluginConfig(props) {
    return (
        <PluginConfig
            {...props}
            hideInstanceName
        />
    );
}

export function getRecognizeConfigMeta(serviceInstanceKey, pluginList, t) {
    const serviceSourceType = getServiceSouceType(serviceInstanceKey);
    const pluginServiceFlag = whetherPluginService(serviceInstanceKey);
    const serviceName = getServiceName(serviceInstanceKey);

    const ConfigComponent = pluginServiceFlag ? RecognizePluginConfig : builtinServices[serviceName].Config;

    if (pluginServiceFlag && !(serviceName in pluginList)) {
        return null;
    }

    const title =
        serviceSourceType === ServiceSourceType.BUILDIN
            ? t(`services.recognize.${serviceName}.title`)
            : `${pluginList[serviceName].display} [${t('common.plugin')}]`;
    const icon =
        serviceSourceType === ServiceSourceType.BUILDIN ? (
            <img
                src={serviceName === 'system' ? `logo/${osType}.svg` : builtinServices[serviceName].info.icon}
                className='h-[24px] w-[24px] my-auto'
                draggable={false}
            />
        ) : (
            <img
                src={pluginList[serviceName].icon}
                className='h-[24px] w-[24px] my-auto'
                draggable={false}
            />
        );

    return {
        serviceName,
        serviceSourceType,
        pluginServiceFlag,
        ConfigComponent,
        title,
        icon,
    };
}

export function RecognizeConfigPanel(props) {
    const { serviceInstanceKey, pluginList, updateServiceInstanceList, onClose } = props;
    const { t } = useTranslation();
    const meta = getRecognizeConfigMeta(serviceInstanceKey, pluginList, t);

    if (!meta) return null;

    const { serviceName, ConfigComponent } = meta;

    return (
        <ConfigComponent
            name={serviceName}
            instanceKey={serviceInstanceKey}
            pluginType='recognize'
            pluginList={pluginList}
            updateServiceList={updateServiceInstanceList}
            onClose={onClose}
        />
    );
}

export default function ConfigModal(props) {
    const { serviceInstanceKey, pluginList, isOpen, onOpenChange, updateServiceInstanceList } = props;
    const { t } = useTranslation();
    const meta = getRecognizeConfigMeta(serviceInstanceKey, pluginList, t);

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
                            <RecognizeConfigPanel
                                serviceInstanceKey={serviceInstanceKey}
                                pluginList={pluginList}
                                updateServiceInstanceList={updateServiceInstanceList}
                                onClose={onClose}
                            />
                        </ModalBody>
                        <ModalFooter>
                            <Button
                                color='danger'
                                variant='light'
                                onPress={onClose}
                            >
                                {t('common.cancel')}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
