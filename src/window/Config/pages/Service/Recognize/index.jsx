import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { Card, CardBody, Spacer, Button, useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';

import { useToastStyle } from '../../../../../hooks';
import { useConfig, deleteKey } from '../../../../../hooks';
import { osType } from '../../../../../utils/env';
import { getServiceName } from '../../../../../utils/service_instance';
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
            <Card shadow='none' className='border border-default-200/70 bg-content1/90'>
                <CardBody className='p-4'>
                    <h2 className='mb-4 text-[16px] font-bold'>
                        {t('config.service.label')}
                    </h2>
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable
                            droppableId='droppable'
                            direction='vertical'
                        >
                            {(provided) => (
                                <div
                                    className='max-h-[420px] overflow-y-auto pr-1'
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
                                                                    setCurrentConfigKey={setCurrentConfigKey}
                                                                    onConfigOpen={onConfigOpen}
                                                                />
                                                                <Spacer y={2} />
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
                    <Spacer y={2} />
                    <div className='flex'>
                        <Button fullWidth variant='flat' onPress={onAddOpen}>
                            {t('config.service.add_service')}
                        </Button>
                    </div>
                </CardBody>
            </Card>
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
