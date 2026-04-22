import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { Card, CardBody, Spacer, Button, useDisclosure } from '@nextui-org/react';
import toast from 'react-hot-toast';
import React, { useEffect, useState } from 'react';
import { LuPencilLine, LuVolume2 } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';

import AiProviderIcon from '../../../../../components/AiProviderIcon';
import SortableConfigRow from '../../../../../components/SortableConfigRow';
import { useToastStyle } from '../../../../../hooks';
import { useConfig, deleteKey } from '../../../../../hooks';
import {
    AI_API_SERVICE_LIST_KEY,
    AI_PROVIDER_PRESETS,
    AI_PROVIDER_PRIORITY,
    createAiApiConfigForProvider,
    createAiApiInstanceKey,
    ensureAiApiConfigMigration,
} from '../../../../../utils/aiConfig';
import { store } from '../../../../../utils/store';
import AddServiceModal from '../AddServiceModal';
import ServiceItem from './ServiceItem';
import ConfigModal from './ConfigModal';
import SpeechConfigModal from './SpeechConfigModal';

function SpeechServiceItem(props) {
    const { onConfigOpen } = props;
    const { t } = useTranslation();

    return (
        <SortableConfigRow
            showDragHandle={false}
            icon={<LuVolume2 className='text-[18px]' />}
            title={t('ai_config.speech_service_item_title', {
                defaultValue: 'Speech Configuration',
            })}
            description={t('ai_config.speech_service_item_desc', {
                defaultValue: 'Edit the built-in speech and read aloud settings.',
            })}
            actions={
                <Button
                    isIconOnly
                    size='sm'
                    variant='light'
                    className='text-default-500'
                    onPress={onConfigOpen}
                >
                    <LuPencilLine className='text-[18px]' />
                </Button>
            }
        />
    );
}

export default function AIConfig() {
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const { isOpen: isAddOpen, onOpen: onAddOpen, onOpenChange: onAddOpenChange } = useDisclosure();
    const { isOpen: isConfigOpen, onOpen: onConfigOpen, onOpenChange: onConfigOpenChange } = useDisclosure();
    const {
        isOpen: isSpeechConfigOpen,
        onOpen: onSpeechConfigOpen,
        onOpenChange: onSpeechConfigOpenChange,
    } = useDisclosure();
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

    const builtinServiceItems = AI_PROVIDER_PRIORITY.map((providerId) => {
        const preset = AI_PROVIDER_PRESETS[providerId];

        return {
            key: `ai_provider_${providerId}`,
            label: t(`ai_config.providers.${providerId}`, {
                defaultValue: preset.label,
            }),
            icon: <AiProviderIcon providerId={providerId} className='text-[18px]' />,
            onSelect: async () => {
                const instanceKey = createAiApiInstanceKey();
                await store.load();
                await store.set(instanceKey, createAiApiConfigForProvider(providerId));
                await store.save();
                setCurrentConfigKey(instanceKey);
                onConfigOpen();
            },
        };
    });

    return (
        <>
            <Card shadow='none' className='border border-default-200/70 bg-content1/90'>
                <CardBody className='p-4'>
                    <h2 className='mb-4 text-[16px] font-bold'>
                        {t('ai_config.title', { defaultValue: 'AI Services' })}
                    </h2>
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable
                            droppableId='ai-api-droppable'
                            direction='vertical'
                        >
                            {(provided) => (
                                <div
                                    className='max-h-[420px] overflow-y-auto pr-1'
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
                                    <SpeechServiceItem onConfigOpen={onSpeechConfigOpen} />
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
            />
            <ConfigModal
                serviceInstanceKey={currentConfigKey}
                isOpen={isConfigOpen}
                onOpenChange={onConfigOpenChange}
                updateServiceInstanceList={updateServiceInstanceList}
            />
            <SpeechConfigModal
                isOpen={isSpeechConfigOpen}
                onOpenChange={onSpeechConfigOpenChange}
            />
        </>
    );
}
