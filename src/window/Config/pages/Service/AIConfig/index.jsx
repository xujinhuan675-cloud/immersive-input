import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { Card, Spacer, Button, useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import React, { useEffect, useState } from 'react';

import { useToastStyle } from '../../../../../hooks';
import { osType } from '../../../../../utils/env';
import { useConfig, deleteKey } from '../../../../../hooks';
import { useTranslation } from 'react-i18next';
import { AI_API_SERVICE_LIST_KEY, ensureAiApiConfigMigration } from '../../../../../utils/aiConfig';
import ServiceItem from './ServiceItem';
import SelectModal from './SelectModal';
import ConfigModal from './ConfigModal';

export default function AIConfig() {
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const { isOpen: isSelectOpen, onOpen: onSelectOpen, onOpenChange: onSelectOpenChange } = useDisclosure();
    const { isOpen: isConfigOpen, onOpen: onConfigOpen, onOpenChange: onConfigOpenChange } = useDisclosure();
    const [currentConfigKey, setCurrentConfigKey] = useState(null);
    const [aiApiServiceInstanceList, setAiApiServiceInstanceList] = useConfig(AI_API_SERVICE_LIST_KEY, []);

    useEffect(() => {
        let mounted = true;

        ensureAiApiConfigMigration().then((instanceList) => {
            if (!mounted) return;
            setAiApiServiceInstanceList(instanceList, true);
            if (!currentConfigKey && instanceList[0]) {
                setCurrentConfigKey(instanceList[0]);
            }
        });

        return () => {
            mounted = false;
        };
    }, []);

    const reorder = (list, startIndex, endIndex) => {
        const result = Array.from(list);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return result;
    };

    const onDragEnd = (result) => {
        if (!result.destination) return;
        const items = reorder(aiApiServiceInstanceList, result.source.index, result.destination.index);
        setAiApiServiceInstanceList(items);
    };

    const deleteServiceInstance = (instanceKey) => {
        if (aiApiServiceInstanceList.length === 1) {
            toast.error(t('config.service.least'), { style: toastStyle });
            return;
        }

        setAiApiServiceInstanceList(aiApiServiceInstanceList.filter((item) => item !== instanceKey));
        deleteKey(instanceKey);
        if (currentConfigKey === instanceKey) {
            const nextKey = aiApiServiceInstanceList.find((item) => item !== instanceKey) ?? null;
            setCurrentConfigKey(nextKey);
        }
    };

    const updateServiceInstanceList = (instanceKey) => {
        if (aiApiServiceInstanceList.includes(instanceKey)) {
            return;
        }

        setAiApiServiceInstanceList([...aiApiServiceInstanceList, instanceKey]);
        setCurrentConfigKey(instanceKey);
    };

    return (
        <>
            <Toaster />
            <Card
                className={`${
                    osType === 'Linux' ? 'h-[calc(100vh-140px)]' : 'h-[calc(100vh-120px)]'
                } overflow-y-auto p-5 flex justify-between`}
            >
                <div className='flex h-full flex-col'>
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable
                            droppableId='ai-api-droppable'
                            direction='vertical'
                        >
                            {(provided) => (
                                <div
                                    className='overflow-y-auto h-full'
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                >
                                    {aiApiServiceInstanceList !== null &&
                                        aiApiServiceInstanceList.map((instanceKey, index) => (
                                            <Draggable
                                                key={instanceKey}
                                                draggableId={instanceKey}
                                                index={index}
                                            >
                                                {(draggableProvided) => (
                                                    <div
                                                        ref={draggableProvided.innerRef}
                                                        {...draggableProvided.draggableProps}
                                                    >
                                                        <ServiceItem
                                                            {...draggableProvided.dragHandleProps}
                                                            serviceInstanceKey={instanceKey}
                                                            deleteServiceInstance={deleteServiceInstance}
                                                            setCurrentConfigKey={setCurrentConfigKey}
                                                            onConfigOpen={onConfigOpen}
                                                        />
                                                        <Spacer y={2} />
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>

                    <Spacer y={2} />

                    <div className='flex'>
                        <Button
                            fullWidth
                            variant='flat'
                            onPress={onSelectOpen}
                        >
                            {t('config.service.add_builtin_service')}
                        </Button>
                    </div>
                </div>
            </Card>
            <SelectModal
                isOpen={isSelectOpen}
                onOpenChange={onSelectOpenChange}
                setCurrentConfigKey={setCurrentConfigKey}
                onConfigOpen={onConfigOpen}
            />
            <ConfigModal
                serviceInstanceKey={currentConfigKey}
                isOpen={isConfigOpen}
                onOpenChange={onConfigOpenChange}
                updateServiceInstanceList={updateServiceInstanceList}
            />
        </>
    );
}
