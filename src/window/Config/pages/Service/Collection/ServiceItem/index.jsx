import { Button } from '@nextui-org/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { LuPencilLine, LuTrash2 } from 'react-icons/lu';

import SortableConfigRow from '../../../../../../components/SortableConfigRow';
import { useConfig } from '../../../../../../hooks';
import * as builtinServices from '../../../../../../services/collection';
import {
    getServiceName,
    getServiceSouceType,
    INSTANCE_NAME_CONFIG_KEY,
    ServiceSourceType,
} from '../../../../../../utils/service_instance';

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
    const [serviceInstanceConfig] = useConfig(serviceInstanceKey, {});

    const serviceSourceType = getServiceSouceType(serviceInstanceKey);
    const serviceName = getServiceName(serviceInstanceKey);

    if (serviceSourceType === ServiceSourceType.PLUGIN && !(serviceName in pluginList)) {
        return <></>;
    }

    if (serviceInstanceConfig === null) {
        return <></>;
    }

    const isBuiltin = serviceSourceType === ServiceSourceType.BUILDIN;
    const displayName = isBuiltin
        ? serviceInstanceConfig[INSTANCE_NAME_CONFIG_KEY] ||
          t(`services.collection.${serviceName}.title`)
        : serviceInstanceConfig[INSTANCE_NAME_CONFIG_KEY] ||
          pluginList[serviceName].display;

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
