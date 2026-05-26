import { Button, Switch } from '@nextui-org/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdKeyboardArrowDown } from 'react-icons/md';

import SortableConfigRow from '../../../../../../components/SortableConfigRow';
import { useConfig } from '../../../../../../hooks';
import * as builtinServices from '../../../../../../services/recognize';
import { osType } from '../../../../../../utils/env';
import { getServiceName, getServiceSouceType, ServiceSourceType } from '../../../../../../utils/service_instance';
import { RecognizeConfigPanel } from '../ConfigModal';

export default function ServiceItem(props) {
    const {
        serviceInstanceKey,
        pluginList,
        activeServiceInstanceKey,
        activateServiceInstance,
        deleteServiceInstance,
        updateServiceInstanceList,
        ...drag
    } = props;
    const { t } = useTranslation();
    const [serviceInstanceConfig] = useConfig(serviceInstanceKey, {});
    const [expanded, setExpanded] = useState(false);

    const serviceSourceType = getServiceSouceType(serviceInstanceKey);
    const serviceName = getServiceName(serviceInstanceKey);

    if (serviceSourceType === ServiceSourceType.PLUGIN && !(serviceName in pluginList)) {
        return <></>;
    }

    if (serviceInstanceConfig === null) {
        return <></>;
    }

    const isBuiltin = serviceSourceType === ServiceSourceType.BUILDIN;
    const displayName = isBuiltin ? t(`services.recognize.${serviceName}.title`) : pluginList[serviceName].display;
    const toggleExpanded = () => setExpanded((value) => !value);
    const closeExpanded = () => setExpanded(false);
    const deleteServiceLabel = t('config.service.delete_service', { defaultValue: 'Delete service' });

    return (
        <SortableConfigRow
            dragHandleProps={drag}
            variant='list'
            icon={
                <img
                    src={
                        isBuiltin
                            ? serviceName === 'system'
                                ? `logo/${osType}.svg`
                                : builtinServices[serviceName].info.icon
                            : pluginList[serviceName].icon
                    }
                    className='h-5 w-5 object-contain'
                    draggable={false}
                />
            }
            title={displayName}
            description={isBuiltin ? null : t('common.plugin')}
            expanded={expanded}
            onPress={toggleExpanded}
            actions={
                <>
                    <Switch
                        size='sm'
                        isSelected={serviceInstanceKey === activeServiceInstanceKey}
                        onValueChange={(value) => {
                            if (value) {
                                activateServiceInstance(serviceInstanceKey);
                            }
                        }}
                    />
                    <Button
                        isIconOnly
                        size='sm'
                        variant='light'
                        className='h-8 w-8 min-w-8 rounded-md text-default-500'
                        onPress={toggleExpanded}
                    >
                        <MdKeyboardArrowDown
                            className={`text-[20px] transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                    </Button>
                </>
            }
        >
            {expanded ? (
                <div className='space-y-4'>
                    <RecognizeConfigPanel
                        serviceInstanceKey={serviceInstanceKey}
                        pluginList={pluginList}
                        updateServiceInstanceList={updateServiceInstanceList ?? (() => {})}
                        onClose={closeExpanded}
                    />
                    <div className='flex items-center justify-between border-t border-default-100 pt-3'>
                        <Button
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
                        <Button
                            size='sm'
                            variant='light'
                            className='h-8 px-3 text-[13px] font-medium text-default-600'
                            onPress={closeExpanded}
                        >
                            {t('common.cancel')}
                        </Button>
                    </div>
                </div>
            ) : null}
        </SortableConfigRow>
    );
}
