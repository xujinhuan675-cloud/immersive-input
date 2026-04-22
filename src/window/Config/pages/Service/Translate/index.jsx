import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { Card, CardBody, Spacer, Button, useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';

import { useToastStyle } from '../../../../../hooks';
import { useConfig, deleteKey } from '../../../../../hooks';
import { getServiceName } from '../../../../../utils/service_instance';
import * as builtinServices from '../../../../../services/translate';
import AddServiceModal from '../AddServiceModal';
import {
    TRANSLATE_DEFAULT_VISIBLE,
    TRANSLATE_LEGACY_DEFAULT,
    TRANSLATE_SERVICE_PRIORITY,
    migrateServiceInstanceList,
    sortBuiltinServiceItems,
} from '../servicePriority';
import ServiceItem from './ServiceItem';
import ConfigModal from './ConfigModal';

const TRANSLATE_SERVICE_CATALOG_VERSION_KEY = 'translate_service_catalog_version';

export default function Translate(props) {
    const { pluginList } = props;
    const { isOpen: isAddOpen, onOpen: onAddOpen, onOpenChange: onAddOpenChange } = useDisclosure();
    const { isOpen: isConfigOpen, onOpen: onConfigOpen, onOpenChange: onConfigOpenChange } = useDisclosure();
    const [currentConfigKey, setCurrentConfigKey] = useState('deepl');
    const [translateServiceInstanceList, setTranslateServiceInstanceList] = useConfig(
        'translate_service_list',
        TRANSLATE_DEFAULT_VISIBLE
    );
    const [catalogVersion, setCatalogVersion] = useConfig(TRANSLATE_SERVICE_CATALOG_VERSION_KEY, 0);

    const { t } = useTranslation();
    const toastStyle = useToastStyle();

    useEffect(() => {
        if (translateServiceInstanceList === null || catalogVersion === null) {
            return;
        }

        if (catalogVersion >= 1) {
            return;
        }

        const nextList = migrateServiceInstanceList(translateServiceInstanceList, {
            priorityList: TRANSLATE_SERVICE_PRIORITY,
            recommendedList: TRANSLATE_DEFAULT_VISIBLE,
            legacyDefaultList: TRANSLATE_LEGACY_DEFAULT,
        });

        const currentListJson = JSON.stringify(translateServiceInstanceList);
        const nextListJson = JSON.stringify(nextList);

        if (currentListJson !== nextListJson) {
            setTranslateServiceInstanceList(nextList, true);
        }

        setCatalogVersion(1, true);
    }, [translateServiceInstanceList, catalogVersion]);

    const reorder = (list, startIndex, endIndex) => {
        const result = Array.from(list);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return result;
    };
    const onDragEnd = async (result) => {
        if (!result.destination) return;
        const items = reorder(translateServiceInstanceList, result.source.index, result.destination.index);
        setTranslateServiceInstanceList(items);
    };

    const deleteServiceInstance = (instanceKey) => {
        if (translateServiceInstanceList.length === 1) {
            toast.error(t('config.service.least'), { style: toastStyle });
            return;
        } else {
            setTranslateServiceInstanceList(translateServiceInstanceList.filter((x) => x !== instanceKey));
            deleteKey(instanceKey);
        }
    };
    const updateServiceInstanceList = (instanceKey) => {
        if (translateServiceInstanceList.includes(instanceKey)) {
            return;
        } else {
            const newList = [...translateServiceInstanceList, instanceKey];
            setTranslateServiceInstanceList(newList);
        }
    };
    const deletePluginServices = (pluginName, options = {}) => {
        const nextList = translateServiceInstanceList.filter((item) => getServiceName(item) !== pluginName);
        if (options.preview) {
            if (nextList.length === 0) {
                toast.error(t('config.service.least'), { style: toastStyle });
                return false;
            }
            return true;
        }
        translateServiceInstanceList
            .filter((item) => getServiceName(item) === pluginName)
            .forEach((item) => {
                deleteKey(item);
            });
        setTranslateServiceInstanceList(nextList);
        return true;
    };
    const builtinServiceItems = sortBuiltinServiceItems(
        Object.keys(builtinServices).map((serviceKey) => ({
            key: serviceKey,
            label: t(`services.translate.${builtinServices[serviceKey].info.name}.title`),
            icon: builtinServices[serviceKey].info.icon,
        })),
        TRANSLATE_SERVICE_PRIORITY
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
                                    {translateServiceInstanceList !== null &&
                                        translateServiceInstanceList.map((x, i) => {
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
                                                                    key={x}
                                                                    serviceInstanceKey={x}
                                                                    pluginList={pluginList}
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
                pluginType='translate'
                pluginList={pluginList}
                deletePluginServices={deletePluginServices}
            />
            <ConfigModal
                serviceInstanceKey={currentConfigKey}
                pluginList={pluginList}
                isOpen={isConfigOpen}
                onOpenChange={onConfigOpenChange}
                updateServiceInstanceList={updateServiceInstanceList}
            />
        </>
    );
}
