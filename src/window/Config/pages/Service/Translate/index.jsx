import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { Card, CardBody, Spacer, Button, useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';

import AiProviderIcon from '../../../../../components/AiProviderIcon';
import { useToastStyle } from '../../../../../hooks';
import { useConfig, deleteKey } from '../../../../../hooks';
import { getServiceName } from '../../../../../utils/service_instance';
import {
    AI_API_SERVICE_LIST_KEY,
    getAiApiDisplayName,
    getAiProviderId,
    getAiProviderTitle,
    getMergedAiApiConfig,
} from '../../../../../utils/aiConfig';
import {
    createAiTranslateServiceKey,
    createDefaultAiTranslateConfig,
    ensureAiTranslateBindings,
    getMergedAiTranslateConfig,
    isAiTranslateServiceKey,
} from '../../../../../utils/aiTranslate';
import { store } from '../../../../../utils/store';
import * as builtinServices from '../../../../../services/translate';
import AddServiceModal from '../AddServiceModal';
import {
    TRANSLATE_DEFAULT_VISIBLE,
    TRANSLATE_SERVICE_CATALOG_VERSION,
    TRANSLATE_SERVICE_PRIORITY,
    migrateServiceInstanceList,
    migrateTranslateRecommendedServices,
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
    const [aiServiceConfigMap, setAiServiceConfigMap] = useState({});
    const [translateServiceInstanceList, setTranslateServiceInstanceList] = useConfig(
        'translate_service_list',
        TRANSLATE_DEFAULT_VISIBLE
    );
    const [catalogVersion, setCatalogVersion] = useConfig(TRANSLATE_SERVICE_CATALOG_VERSION_KEY, 0);
    const [aiApiServiceInstanceList] = useConfig(AI_API_SERVICE_LIST_KEY, []);

    const { t } = useTranslation();
    const toastStyle = useToastStyle();

    useEffect(() => {
        if (
            translateServiceInstanceList === null ||
            catalogVersion === null ||
            aiApiServiceInstanceList === null
        ) {
            return;
        }
        let cancelled = false;

        const syncServiceList = async () => {
            let nextList = translateServiceInstanceList;

            if (catalogVersion < 1) {
                nextList = migrateServiceInstanceList(nextList, {
                    priorityList: TRANSLATE_SERVICE_PRIORITY,
                    recommendedList: TRANSLATE_DEFAULT_VISIBLE,
                });
            }

            if (catalogVersion < TRANSLATE_SERVICE_CATALOG_VERSION) {
                nextList = migrateTranslateRecommendedServices(nextList);
            }

            const { nextList: nextAiBindingList } = await ensureAiTranslateBindings(
                nextList,
                aiApiServiceInstanceList,
                {
                    legacySourceList: translateServiceInstanceList,
                }
            );

            if (cancelled) {
                return;
            }

            if (JSON.stringify(translateServiceInstanceList) !== JSON.stringify(nextAiBindingList)) {
                setTranslateServiceInstanceList(nextAiBindingList, true);
            }

            if (catalogVersion < TRANSLATE_SERVICE_CATALOG_VERSION) {
                setCatalogVersion(TRANSLATE_SERVICE_CATALOG_VERSION, true);
            }
        };

        void syncServiceList();
        return () => {
            cancelled = true;
        };
    }, [translateServiceInstanceList, catalogVersion, aiApiServiceInstanceList]);

    useEffect(() => {
        let cancelled = false;

        const loadAiServiceConfigMap = async () => {
            await store.load();
            const nextConfigMap = {};
            for (const serviceInstanceKey of aiApiServiceInstanceList ?? []) {
                nextConfigMap[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
            }
            if (!cancelled) {
                setAiServiceConfigMap(nextConfigMap);
            }
        };

        void loadAiServiceConfigMap();
        return () => {
            cancelled = true;
        };
    }, [aiApiServiceInstanceList]);

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
        }

        setTranslateServiceInstanceList(translateServiceInstanceList.filter((x) => x !== instanceKey));
        if (isAiTranslateServiceKey(instanceKey)) {
            void store.load().then(async () => {
                const currentConfig = await store.get(instanceKey);
                await store.set(
                    instanceKey,
                    getMergedAiTranslateConfig(
                        {
                            ...(currentConfig ?? {}),
                            hidden: true,
                        },
                        instanceKey
                    )
                );
                await store.save();
            });
            return;
        }

        deleteKey(instanceKey);
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
    const aiTranslateServiceItems = (aiApiServiceInstanceList ?? []).map((serviceInstanceKey) => {
        const mergedAiConfig = getMergedAiApiConfig(aiServiceConfigMap[serviceInstanceKey] ?? {});
        const providerId = getAiProviderId(mergedAiConfig);
        const providerTitle = t(`ai_config.providers.${providerId}`, {
            defaultValue: getAiProviderTitle(providerId),
        });
        const bindingKey = createAiTranslateServiceKey(serviceInstanceKey);

        return {
            key: bindingKey,
            label: getAiApiDisplayName(mergedAiConfig, providerTitle),
            icon: <AiProviderIcon providerId={providerId} className='text-[18px]' />,
            onSelect: async () => {
                await store.load();
                const currentConfig = await store.get(bindingKey);
                await store.set(
                    bindingKey,
                    createDefaultAiTranslateConfig(serviceInstanceKey, {
                        ...(currentConfig ?? {}),
                        hidden: false,
                    })
                );
                await store.save();
                updateServiceInstanceList(bindingKey);
            },
        };
    });

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
                extraSections={[
                    {
                        key: 'ai_services',
                        title: t('ai_config.title', { defaultValue: 'AI Services' }),
                        services: aiTranslateServiceItems,
                        emptyMessage:
                            (aiApiServiceInstanceList ?? []).length > 0
                                ? t('config.service.all_ai_services_added', {
                                      defaultValue: 'All AI services have already been added.',
                                  })
                                : t('config.service.no_ai_services', {
                                      defaultValue: 'No AI services configured yet.',
                                  }),
                    },
                ]}
                pluginType='translate'
                pluginList={pluginList}
                serviceInstanceList={translateServiceInstanceList}
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
