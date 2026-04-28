import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@nextui-org/react';
import { removeDir, BaseDirectory } from '@tauri-apps/api/fs';
import toast, { Toaster } from 'react-hot-toast';
import { MdDeleteOutline } from 'react-icons/md';
import { LuPlus } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api';
import { emit } from '@tauri-apps/api/event';
import React, { useState } from 'react';

import { createServiceInstanceKey, getServiceName } from '../../../../../utils/service_instance';
import { useToastStyle } from '../../../../../hooks';

function SectionTitle({ children }) {
    return <div className='mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-default-400 first:mt-0'>{children}</div>;
}

function ServiceSelectRow({ icon, label, onPress, trailing, disabled = false }) {
    return (
        <div className='mb-2 flex items-center gap-2'>
            <button
                type='button'
                onClick={onPress}
                disabled={disabled}
                className={`flex min-h-[56px] flex-1 items-center gap-3 rounded-xl border border-divider/70 bg-default-50 px-4 py-3 text-left transition-colors ${
                    disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-default-100'
                }`}
            >
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-content1 text-default-600 shadow-sm'>
                    {typeof icon === 'string' ? (
                        <img
                            src={icon}
                            className='h-[22px] w-[22px] object-contain'
                            draggable={false}
                        />
                    ) : (
                        icon
                    )}
                </div>
                <div className='min-w-0 flex-1 text-sm font-medium text-foreground'>{label}</div>
            </button>
            {trailing}
        </div>
    );
}

export default function AddServiceModal(props) {
    const {
        isOpen,
        onOpenChange,
        setCurrentConfigKey,
        onConfigOpen,
        builtinServices = [],
        extraSections = [],
        onBuiltinSelect,
        pluginType,
        pluginList = {},
        serviceInstanceList = [],
        deletePluginServices,
    } = props;
    const [installing, setInstalling] = useState(false);
    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const addedServiceNameSet = new Set((serviceInstanceList ?? []).map((serviceInstanceKey) => getServiceName(serviceInstanceKey)));
    const pluginEntries = Object.entries(pluginList ?? {})
        .filter(([pluginKey]) => !addedServiceNameSet.has(pluginKey))
        .sort((left, right) =>
            String(left[1]?.display ?? left[0]).localeCompare(String(right[1]?.display ?? right[0]))
        );
    const hasPluginSupport = Boolean(pluginType);
    const builtinEmptyMessage =
        builtinServices.length > 0
            ? t('config.service.all_builtin_services_added', {
                  defaultValue: 'All built-in services have already been added.',
              })
            : t('config.service.no_builtin_services', {
                  defaultValue: 'No built-in services available.',
              });

    const getVisibleServices = (services = []) =>
        services.filter((service) => !addedServiceNameSet.has(service.key));

    const renderServiceSection = (title, services = [], emptyMessage = null, onClose = null) => {
        const visibleServices = getVisibleServices(services);

        return (
            <>
                <SectionTitle>{title}</SectionTitle>
                {visibleServices.length === 0 && emptyMessage ? (
                    <div className='mb-3 rounded-xl border border-dashed border-divider px-4 py-3 text-sm text-default-500'>
                        {emptyMessage}
                    </div>
                ) : null}
                {visibleServices.map((service) => (
                    <ServiceSelectRow
                        key={service.key}
                        icon={service.icon}
                        label={service.label}
                        onPress={() => {
                            if (service.onSelect) {
                                service.onSelect();
                            } else if (onBuiltinSelect) {
                                onBuiltinSelect(service);
                            } else {
                                setCurrentConfigKey(createServiceInstanceKey(service.key));
                                onConfigOpen();
                            }
                            onClose?.();
                        }}
                    />
                ))}
            </>
        );
    };

    const handleInstallPlugin = async () => {
        if (installing) {
            return;
        }

        setInstalling(true);
        try {
            const selected = await open({
                multiple: true,
                directory: false,
                filters: [
                    {
                        name: '*.potext',
                        extensions: ['potext'],
                    },
                ],
            });

            if (selected === null) {
                return;
            }

            const count = await invoke('install_plugin', {
                pathList: selected,
            });
            toast.success(`Installed ${count} plugins`, {
                style: toastStyle,
            });
            emit('reload_plugin_list');
        } catch (error) {
            toast.error(error.toString(), { style: toastStyle });
        } finally {
            setInstalling(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            scrollBehavior='inside'
        >
            <Toaster />
            <ModalContent className='max-h-[80vh]'>
                {(onClose) => (
                    <>
                        <ModalHeader>{t('config.service.add_service')}</ModalHeader>
                        <ModalBody>
                            {renderServiceSection(
                                t('config.service.builtin_services', { defaultValue: 'Built-in Services' }),
                                builtinServices,
                                builtinEmptyMessage,
                                onClose
                            )}

                            {extraSections.map((section) => (
                                <React.Fragment key={section.key ?? section.title}>
                                    {renderServiceSection(
                                        section.title,
                                        section.services,
                                        section.emptyMessage ?? null,
                                        onClose
                                    )}
                                </React.Fragment>
                            ))}

                            {hasPluginSupport ? (
                                <>
                                    <SectionTitle>
                                        {t('config.service.external_plugins', { defaultValue: 'External Plugins' })}
                                    </SectionTitle>

                                    <ServiceSelectRow
                                        icon={<LuPlus className='text-[18px]' />}
                                        label={t('config.service.install_plugin')}
                                        disabled={installing}
                                        onPress={handleInstallPlugin}
                                    />

                                    {pluginEntries.map(([pluginKey, pluginInfo]) => (
                                        <ServiceSelectRow
                                            key={pluginKey}
                                            icon={pluginInfo.icon}
                                            label={pluginInfo.display}
                                            onPress={() => {
                                                setCurrentConfigKey(createServiceInstanceKey(pluginKey));
                                                onConfigOpen();
                                                onClose();
                                            }}
                                            trailing={
                                                <Button
                                                    isIconOnly
                                                    color='danger'
                                                    variant='flat'
                                                    onPress={() => {
                                                        const canDelete = deletePluginServices?.(pluginKey, {
                                                            preview: true,
                                                        });
                                                        if (canDelete === false) {
                                                            return;
                                                        }
                                                        removeDir(`plugins/${pluginType}/${pluginKey}`, {
                                                            dir: BaseDirectory.AppConfig,
                                                            recursive: true,
                                                        }).then(
                                                            () => {
                                                                toast.success(t('config.service.uninstall_success'), {
                                                                    style: toastStyle,
                                                                });
                                                                deletePluginServices?.(pluginKey);
                                                                emit('reload_plugin_list');
                                                            },
                                                            (error) => {
                                                                toast.error(error.toString(), { style: toastStyle });
                                                            }
                                                        );
                                                    }}
                                                >
                                                    <MdDeleteOutline className='text-xl' />
                                                </Button>
                                            }
                                        />
                                    ))}
                                </>
                            ) : null}
                        </ModalBody>
                        <ModalFooter>
                            <Button
                                color='danger'
                                variant='light'
                                onPress={onClose}
                            >
                                {t('common.cancel')}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
