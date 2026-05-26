import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { Button, useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';

import { useToastStyle } from '../../../../../hooks';
import { useConfig, deleteKey } from '../../../../../hooks';
import { osType } from '../../../../../utils/env';
import { INSTANCE_NAME_CONFIG_KEY, getServiceName } from '../../../../../utils/service_instance';
import * as builtinServices from '../../../../../services/recognize';
import AddServiceModal from '../AddServiceModal';
import {
    RECOGNIZE_DEFAULT_VISIBLE,
    RECOGNIZE_SERVICE_CATALOG_VERSION,
    RECOGNIZE_LEGACY_DEFAULT,
    RECOGNIZE_SERVICE_PRIORITY,
    migrateServiceInstanceList,
    migrateRecognizeRecommendedServices,
    sortBuiltinServiceItems,
} from '../servicePriority';
import ServiceItem from './ServiceItem';
import ConfigModal from './ConfigModal';
import { store } from '../../../../../utils/store';

const RECOGNIZE_SERVICE_CATALOG_VERSION_KEY = 'recognize_service_catalog_version';
const RECOGNIZE_ACTIVE_SERVICE_INSTANCE_KEY = 'recognize_active_service_instance_key';

export default function Recognize(props) {
    const { pluginList } = props;
    const { isOpen: isAddOpen, onOpen: onAddOpen, onOpenChange: onAddOpenChange } = useDisclosure();
    const { isOpen: isConfigOpen, onOpen: onConfigOpen, onOpenChange: onConfigOpenChange } = useDisclosure();
    const [currentConfigKey, setCurrentConfigKey] = useState('system');
    const [recognizeServiceInstanceList, setRecognizeServiceInstanceList] = useConfig(
        'recognize_service_list',
        RECOGNIZE_DEFAULT_VISIBLE
    );
    const [catalogVersion, setCatalogVersion] = useConfig(RECOGNIZE_SERVICE_CATALOG_VERSION_KEY, 0);
    const [activeServiceInstanceKey, setActiveServiceInstanceKey] = useConfig(
        RECOGNIZE_ACTIVE_SERVICE_INSTANCE_KEY,
        null
    );

    const { t } = useTranslation();
    const toastStyle = useToastStyle();

    useEffect(() => {
        if (recognizeServiceInstanceList === null || catalogVersion === null) {
            return;
        }

        if (catalogVersion >= RECOGNIZE_SERVICE_CATALOG_VERSION) {
            return;
        }

        let nextList = recognizeServiceInstanceList;

        if (catalogVersion < 1) {
            nextList = migrateServiceInstanceList(nextList, {
                priorityList: RECOGNIZE_SERVICE_PRIORITY,
                recommendedList: RECOGNIZE_DEFAULT_VISIBLE,
                legacyDefaultList: RECOGNIZE_LEGACY_DEFAULT,
            });
        }

        if (catalogVersion < RECOGNIZE_SERVICE_CATALOG_VERSION) {
            nextList = migrateRecognizeRecommendedServices(nextList);
        }

        const currentListJson = JSON.stringify(recognizeServiceInstanceList);
        const nextListJson = JSON.stringify(nextList);

        if (currentListJson !== nextListJson) {
            setRecognizeServiceInstanceList(nextList, true);
        }

        setCatalogVersion(RECOGNIZE_SERVICE_CATALOG_VERSION, true);
    }, [recognizeServiceInstanceList, catalogVersion]);

    useEffect(() => {
        if (!Array.isArray(recognizeServiceInstanceList) || recognizeServiceInstanceList.length === 0) {
            return;
        }

        if (!activeServiceInstanceKey || !recognizeServiceInstanceList.includes(activeServiceInstanceKey)) {
            setActiveServiceInstanceKey(recognizeServiceInstanceList[0], true);
        }
    }, [recognizeServiceInstanceList, activeServiceInstanceKey]);

    useEffect(() => {
        if (!Array.isArray(recognizeServiceInstanceList)) {
            return;
        }

        let cancelled = false;

        const removeLegacyInstanceNames = async () => {
            await store.load();
            let changed = false;

            for (const serviceInstanceKey of recognizeServiceInstanceList) {
                const currentConfig = await store.get(serviceInstanceKey);
                if (
                    currentConfig &&
                    typeof currentConfig === 'object' &&
                    currentConfig[INSTANCE_NAME_CONFIG_KEY] !== undefined
                ) {
                    const { [INSTANCE_NAME_CONFIG_KEY]: _removed, ...nextConfig } = currentConfig;
                    await store.set(serviceInstanceKey, nextConfig);
                    changed = true;
                }
            }

            if (!cancelled && changed) {
                await store.save();
            }
        };

        void removeLegacyInstanceNames();
        return () => {
            cancelled = true;
        };
    }, [recognizeServiceInstanceList]);

    const reorder = (list, startIndex, endIndex) => {
        const result = Array.from(list);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return result;
    };
    const onDragEnd = async (result) => {
        if (!result.destination) return;
        const items = reorder(recognizeServiceInstanceList, result.source.index, result.destination.index);
        setRecognizeServiceInstanceList(items);
    };

    const deleteServiceInstance = (instanceKey) => {
        if (recognizeServiceInstanceList.length === 1) {
            toast.error(t('config.service.least'), { style: toastStyle });
            return;
        } else {
            const nextList = recognizeServiceInstanceList.filter((x) => x !== instanceKey);
            setRecognizeServiceInstanceList(nextList);
            if (activeServiceInstanceKey === instanceKey && nextList.length > 0) {
                setActiveServiceInstanceKey(nextList[0], true);
            }
            deleteKey(instanceKey);
        }
    };
    const deletePluginServices = (pluginName, options = {}) => {
        const nextList = recognizeServiceInstanceList.filter((item) => getServiceName(item) !== pluginName);
        if (options.preview) {
            if (nextList.length === 0) {
                toast.error(t('config.service.least'), { style: toastStyle });
                return false;
            }
            return true;
        }
        recognizeServiceInstanceList
            .filter((item) => getServiceName(item) === pluginName)
            .forEach((item) => {
                deleteKey(item);
            });
        setRecognizeServiceInstanceList(nextList);
        return true;
    };
    const updateServiceInstanceList = (instanceKey) => {
        if (recognizeServiceInstanceList.includes(instanceKey)) {
            return;
        } else {
            const newList = [...recognizeServiceInstanceList, instanceKey];
            setRecognizeServiceInstanceList(newList);
            setActiveServiceInstanceKey(instanceKey, true);
        }
    };
    const activateServiceInstance = (instanceKey) => {
        if (instanceKey === activeServiceInstanceKey) {
            return;
        }
        setActiveServiceInstanceKey(instanceKey, true);
    };
    const builtinServiceItems = sortBuiltinServiceItems(
        Object.keys(builtinServices).map((serviceKey) => ({
            key: serviceKey,
            label: t(`services.recognize.${builtinServices[serviceKey].info.name}.title`),
            icon: serviceKey === 'system' ? `logo/${osType}.svg` : builtinServices[serviceKey].info.icon,
        })),
        RECOGNIZE_SERVICE_PRIORITY
    );

    return (
        <>
            <Toaster />
            <section className='overflow-hidden rounded-xl border border-default-200/80 bg-content1'>
                <div className='flex items-center justify-between gap-3 border-b border-default-100 px-5 py-3'>
                    <h2 className='text-[15px] font-semibold text-foreground'>{t('config.service.label')}</h2>
                    <Button
                        size='sm'
                        variant='flat'
                        className='h-8 min-w-[72px] rounded-md bg-default-100 px-3 text-[13px] font-medium text-default-600 hover:bg-default-200'
                        onPress={onAddOpen}
                    >
                        {t('config.service.add_service')}
                    </Button>
                </div>
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable
                        droppableId='droppable'
                        direction='vertical'
                    >
                        {(provided) => (
                            <div
                                className='max-h-[420px] overflow-y-auto'
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                            >
                                {recognizeServiceInstanceList !== null &&
                                    recognizeServiceInstanceList.map((x, i) => {
                                        return (
                                            <Draggable
                                                key={x}
                                                draggableId={x}
                                                index={i}
                                            >
                                                {(provided) => {
                                                    return (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                        >
                                                            <ServiceItem
                                                                {...provided.dragHandleProps}
                                                                serviceInstanceKey={x}
                                                                key={x}
                                                                pluginList={pluginList}
                                                                activeServiceInstanceKey={activeServiceInstanceKey}
                                                                activateServiceInstance={activateServiceInstance}
                                                                deleteServiceInstance={deleteServiceInstance}
                                                                updateServiceInstanceList={updateServiceInstanceList}
                                                            />
                                                        </div>
                                                    );
                                                }}
                                            </Draggable>
                                        );
                                    })}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            </section>
            <AddServiceModal
                isOpen={isAddOpen}
                onOpenChange={onAddOpenChange}
                setCurrentConfigKey={setCurrentConfigKey}
                onConfigOpen={onConfigOpen}
                builtinServices={builtinServiceItems}
                pluginType='recognize'
                pluginList={pluginList}
                serviceInstanceList={recognizeServiceInstanceList}
                deletePluginServices={deletePluginServices}
                inlineConfig
                updateServiceInstanceList={updateServiceInstanceList}
            />
            <ConfigModal
                serviceInstanceKey={currentConfigKey}
                isOpen={isConfigOpen}
                pluginList={pluginList}
                onOpenChange={onConfigOpenChange}
                updateServiceInstanceList={updateServiceInstanceList}
            />
        </>
    );
}
