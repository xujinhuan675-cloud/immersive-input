import { Button, Switch } from '@nextui-org/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { LuPencilLine, LuTrash2 } from 'react-icons/lu';

import SortableConfigRow from '../../../../../../components/SortableConfigRow';
import { useConfig } from '../../../../../../hooks';
import * as builtinServices from '../../../../../../services/translate';
import {
    getDisplayInstanceName,
    getServiceName,
    getServiceSouceType,
    INSTANCE_NAME_CONFIG_KEY,
    ServiceSourceType,
} from '../../../../../../utils/service_instance';

const BUILTIN_TRANSLATE_SERVICES_WITHOUT_CONFIG = new Set([
    'bing',
    'ecdict',
    'lingva',
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

    const serviceSourceType = getServiceSouceType(serviceInstanceKey);
    const serviceName = getServiceName(serviceInstanceKey);

    if (serviceSourceType === ServiceSourceType.PLUGIN && !(serviceName in pluginList)) {
        return <></>;
    }

    if (serviceInstanceConfig === null) {
        return <></>;
    }

    const isBuiltin = serviceSourceType === ServiceSourceType.BUILDIN;
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
