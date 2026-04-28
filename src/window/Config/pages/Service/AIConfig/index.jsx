import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { Button, Card, CardBody, Spacer, Switch, useDisclosure } from '@nextui-org/react';
import toast from 'react-hot-toast';
import React, { useEffect, useMemo, useState } from 'react';
import { LuPencilLine, LuVolume2 } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';

import AiProviderIcon from '../../../../../components/AiProviderIcon';
import { useToastStyle } from '../../../../../hooks';
import { useConfig, deleteKey } from '../../../../../hooks';
import {
    AI_API_SERVICE_LIST_KEY,
    AI_PROVIDER_IDS,
    AI_PROVIDER_PRESETS,
    AI_PROVIDER_PRIORITY,
    BUILTIN_TTS_CONFIG_KEY,
    BUILTIN_TTS_PROVIDER_IDS,
    createAiApiConfigForProvider,
    createAiApiInstanceKey,
    createDefaultBuiltInTtsConfig,
    ensureAiApiConfigMigration,
    ensureBuiltInTtsConfigMigration,
    getActiveReadAloudProviderId,
    getMergedBuiltInTtsConfig,
} from '../../../../../utils/aiConfig';
import { store } from '../../../../../utils/store';
import AddServiceModal from '../AddServiceModal';
import ConfigModal from './ConfigModal';
import ServiceItem from './ServiceItem';
import { ConfigServiceIconButton, ConfigServiceListRow } from './ServiceItem/ServiceRow';
import SpeechConfigModal from './SpeechConfigModal';

const DEFAULT_SPEECH_PROVIDER_ORDER = [
    BUILTIN_TTS_PROVIDER_IDS.SYSTEM,
    BUILTIN_TTS_PROVIDER_IDS.OPENAI,
    BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE,
];

function getLocalizedDefaultValue(isChineseUI, zhText, enText) {
    return isChineseUI ? zhText : enText;
}

function getSpeechProviderTitle(providerId, isChineseUI) {
    switch (providerId) {
        case BUILTIN_TTS_PROVIDER_IDS.SYSTEM:
            return getLocalizedDefaultValue(isChineseUI, '本地系统语音', 'Local System Voice');
        case BUILTIN_TTS_PROVIDER_IDS.OPENAI:
            return getLocalizedDefaultValue(isChineseUI, 'OpenAI 语音', 'OpenAI Speech');
        case BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE:
        default:
            return getLocalizedDefaultValue(isChineseUI, '火山语音', 'Volcengine Speech');
    }
}

function getSpeechProviderDescription(providerId, isChineseUI) {
    switch (providerId) {
        case BUILTIN_TTS_PROVIDER_IDS.SYSTEM:
            return getLocalizedDefaultValue(
                isChineseUI,
                '本地朗读，直接使用设备已安装的系统语音。',
                'Local read aloud using the voices already installed on this device.'
            );
        case BUILTIN_TTS_PROVIDER_IDS.OPENAI:
            return getLocalizedDefaultValue(
                isChineseUI,
                '语音更自然，适合希望提升朗读效果的场景。',
                'More natural voice playback for a richer read aloud experience.'
            );
        case BUILTIN_TTS_PROVIDER_IDS.VOLCENGINE:
        default:
            return getLocalizedDefaultValue(
                isChineseUI,
                '适合想要更多语音选择的朗读场景。',
                'A good fit when you want more voice options for read aloud.'
            );
    }
}

function renderSpeechProviderIcon(providerId) {
    if (providerId === BUILTIN_TTS_PROVIDER_IDS.SYSTEM) {
        return <LuVolume2 className='text-[18px]' />;
    }

    if (providerId === BUILTIN_TTS_PROVIDER_IDS.OPENAI) {
        return <AiProviderIcon providerId={AI_PROVIDER_IDS.OPENAI} className='text-[18px]' />;
    }

    return (
        <img
            src='logo/volcengine.svg'
            alt=''
            className='h-[18px] w-[18px]'
        />
    );
}

function repairSpeechProviderOrder(order = []) {
    const normalizedOrder = Array.isArray(order) ? order : [];
    const uniqueOrder = normalizedOrder.filter(
        (providerId, index) =>
            DEFAULT_SPEECH_PROVIDER_ORDER.includes(providerId) && normalizedOrder.indexOf(providerId) === index
    );

    for (const providerId of DEFAULT_SPEECH_PROVIDER_ORDER) {
        if (!uniqueOrder.includes(providerId)) {
            uniqueOrder.push(providerId);
        }
    }

    return uniqueOrder;
}

function reorder(list, startIndex, endIndex) {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
}

function SpeechProviderItem(props) {
    const {
        providerId,
        isActive,
        onSelect,
        onFallbackToSystem,
        onConfigOpen,
        dragHandleProps,
        isChineseUI,
    } = props;

    return (
        <ConfigServiceListRow
            dragHandleProps={dragHandleProps}
            icon={renderSpeechProviderIcon(providerId)}
            title={getSpeechProviderTitle(providerId, isChineseUI)}
            description={getSpeechProviderDescription(providerId, isChineseUI)}
            actions={
                <>
                    <Switch
                        size='sm'
                        isSelected={isActive}
                        onValueChange={(value) => {
                            if (value) {
                                onSelect();
                                return;
                            }

                            if (isActive && providerId !== BUILTIN_TTS_PROVIDER_IDS.SYSTEM) {
                                onFallbackToSystem();
                            }
                        }}
                    />
                    <ConfigServiceIconButton onPress={onConfigOpen}>
                        <LuPencilLine className='text-[18px]' />
                    </ConfigServiceIconButton>
                </>
            }
        />
    );
}

export default function AIConfig() {
    const { t, i18n } = useTranslation();
    const isChineseUI = i18n.language?.startsWith('zh');
    const toastStyle = useToastStyle();
    const { isOpen: isAddOpen, onOpen: onAddOpen, onOpenChange: onAddOpenChange } = useDisclosure();
    const { isOpen: isConfigOpen, onOpen: onConfigOpen, onOpenChange: onConfigOpenChange } = useDisclosure();
    const {
        isOpen: isSpeechConfigOpen,
        onOpen: onSpeechConfigOpen,
        onOpenChange: onSpeechConfigOpenChange,
    } = useDisclosure();
    const [currentConfigKey, setCurrentConfigKey] = useState(null);
    const [currentSpeechProvider, setCurrentSpeechProvider] = useState(null);
    const [aiApiServiceInstanceList, setAiApiServiceInstanceList] = useConfig(AI_API_SERVICE_LIST_KEY, []);
    const [speechConfig, setSpeechConfig] = useConfig(
        BUILTIN_TTS_CONFIG_KEY,
        createDefaultBuiltInTtsConfig(),
        { sync: false }
    );

    useEffect(() => {
        let mounted = true;

        Promise.all([ensureAiApiConfigMigration(), ensureBuiltInTtsConfigMigration()]).then(
            ([instanceList, nextSpeechConfig]) => {
                if (!mounted) return;
                setAiApiServiceInstanceList(instanceList, true);
                setSpeechConfig(nextSpeechConfig, true);
                if (!currentConfigKey && instanceList[0]) {
                    setCurrentConfigKey(instanceList[0]);
                }
            }
        );

        return () => {
            mounted = false;
        };
    }, []);

    const onAiDragEnd = (result) => {
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

    const mergedSpeechConfig = getMergedBuiltInTtsConfig(speechConfig ?? createDefaultBuiltInTtsConfig());
    const speechProviderOrder = useMemo(
        () => repairSpeechProviderOrder(mergedSpeechConfig.speechProviderOrder),
        [mergedSpeechConfig.speechProviderOrder]
    );
    const activeSpeechProvider = getActiveReadAloudProviderId(mergedSpeechConfig);

    const updateSpeechConfig = (patch) => {
        setSpeechConfig(
            {
                ...mergedSpeechConfig,
                ...patch,
            },
            true
        );
    };

    const activateSpeechProvider = (providerId) => {
        if (providerId === BUILTIN_TTS_PROVIDER_IDS.SYSTEM) {
            updateSpeechConfig({
                speechProvider: BUILTIN_TTS_PROVIDER_IDS.SYSTEM,
                speechUseForReadAloud: false,
                speechProviderOrder,
            });
            return;
        }

        updateSpeechConfig({
            speechProvider: providerId,
            speechUseForReadAloud: true,
            speechProviderOrder,
        });
    };

    const onSpeechDragEnd = (result) => {
        if (!result.destination) return;
        const nextOrder = reorder(speechProviderOrder, result.source.index, result.destination.index);
        updateSpeechConfig({ speechProviderOrder: nextOrder });
    };

    const openSpeechConfig = (providerId) => {
        setCurrentSpeechProvider(providerId);
        onSpeechConfigOpen();
    };

    return (
        <>
            <Card shadow='none' className='border border-default-200/70 bg-content1/90'>
                <CardBody className='p-4'>
                    <h2 className='mb-4 text-[16px] font-bold'>
                        {t('ai_config.title', { defaultValue: 'AI Services' })}
                    </h2>
                    <DragDropContext onDragEnd={onAiDragEnd}>
                        <Droppable droppableId='ai-api-droppable' direction='vertical'>
                            {(provided) => (
                                <div
                                    className='max-h-[420px] overflow-y-auto pr-1'
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                >
                                    {aiApiServiceInstanceList !== null &&
                                        aiApiServiceInstanceList.map((instanceKey, index) => (
                                            <Draggable key={instanceKey} draggableId={instanceKey} index={index}>
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
                        <Button fullWidth variant='flat' onPress={onAddOpen}>
                            {t('config.service.add_service')}
                        </Button>
                    </div>
                </CardBody>
            </Card>

            <Spacer y={2} />

            <Card shadow='none' className='border border-default-200/70 bg-content1/90'>
                <CardBody className='p-4'>
                    <h2 className='mb-4 text-[16px] font-bold'>
                        {getLocalizedDefaultValue(isChineseUI, '语音配置', 'Speech Configuration')}
                    </h2>
                    <DragDropContext onDragEnd={onSpeechDragEnd}>
                        <Droppable droppableId='speech-provider-droppable' direction='vertical'>
                            {(provided) => (
                                <div
                                    className='max-h-[420px] overflow-y-auto pr-1'
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                >
                                    {speechProviderOrder.map((providerId, index) => (
                                        <Draggable key={providerId} draggableId={providerId} index={index}>
                                            {(draggableProvided) => (
                                                <div
                                                    ref={draggableProvided.innerRef}
                                                    {...draggableProvided.draggableProps}
                                                >
                                                    <SpeechProviderItem
                                                        dragHandleProps={draggableProvided.dragHandleProps}
                                                        providerId={providerId}
                                                        isActive={activeSpeechProvider === providerId}
                                                        onSelect={() => activateSpeechProvider(providerId)}
                                                        onFallbackToSystem={() =>
                                                            activateSpeechProvider(BUILTIN_TTS_PROVIDER_IDS.SYSTEM)
                                                        }
                                                        onConfigOpen={() => openSpeechConfig(providerId)}
                                                        isChineseUI={isChineseUI}
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
                providerId={currentSpeechProvider}
                title={currentSpeechProvider ? getSpeechProviderTitle(currentSpeechProvider, isChineseUI) : null}
            />
        </>
    );
}
