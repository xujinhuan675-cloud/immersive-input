import { RxDragHandleHorizontal } from 'react-icons/rx';
import { Spacer, Button, Switch } from '@nextui-org/react';
import { MdDeleteOutline, MdOutlineAutoAwesome } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { BiSolidEdit } from 'react-icons/bi';
import React from 'react';

import { useConfig } from '../../../../../../hooks';
import {
    AI_API_PROVIDER_TITLE,
    getAiApiDisplayName,
    getMergedAiApiConfig,
} from '../../../../../../utils/aiConfig';

export default function ServiceItem(props) {
    const { serviceInstanceKey, deleteServiceInstance, setCurrentConfigKey, onConfigOpen, ...drag } = props;
    const { t } = useTranslation();
    const [serviceInstanceConfig, setServiceInstanceConfig] = useConfig(serviceInstanceKey, {});

    if (serviceInstanceConfig === null) {
        return <></>;
    }

    const mergedConfig = getMergedAiApiConfig(serviceInstanceConfig);
    const displayName = getAiApiDisplayName(
        mergedConfig,
        t('ai_config.provider_title', { defaultValue: AI_API_PROVIDER_TITLE })
    );

    return (
        <div className='bg-content2 rounded-md px-[10px] py-[20px] flex justify-between gap-[12px]'>
            <div className='flex min-w-0'>
                <div
                    {...drag}
                    className='text-2xl my-auto shrink-0'
                >
                    <RxDragHandleHorizontal />
                </div>

                <Spacer x={2} />

                <div className='my-auto flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[8px] bg-primary-100 text-primary'>
                    <MdOutlineAutoAwesome className='text-[16px]' />
                </div>

                <Spacer x={2} />

                <div className='min-w-0 my-auto'>
                    <h2 className='truncate'>{displayName}</h2>
                </div>
            </div>

            <div className='flex shrink-0'>
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
                    onPress={() => {
                        setCurrentConfigKey(serviceInstanceKey);
                        onConfigOpen();
                    }}
                >
                    <BiSolidEdit className='text-2xl' />
                </Button>
                <Spacer x={2} />
                <Button
                    isIconOnly
                    size='sm'
                    variant='light'
                    color='danger'
                    onPress={() => {
                        deleteServiceInstance(serviceInstanceKey);
                    }}
                >
                    <MdDeleteOutline className='text-2xl' />
                </Button>
            </div>
        </div>
    );
}
