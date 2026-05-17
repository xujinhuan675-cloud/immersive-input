import { useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { DropdownItem } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { CardBody } from '@nextui-org/react';
import { warn } from 'tauri-plugin-log-api';
import { Button } from '@nextui-org/react';
import { Input } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import { open } from '@tauri-apps/api/dialog';
import React, { useEffect, useState } from 'react';

import SettingsDropdown from '../../../../components/SettingsDropdown';
import { useConfig, useToastStyle } from '../../../../hooks';
import { osType } from '../../../../utils/env';
import * as webdav from './utils/webdav';
import WebDavModal from './WebDavModal';
import * as local from './utils/local';
import * as phraseTransfer from './utils/phrases';
import * as vaultTransfer from './utils/vault';

export default function Backup() {
    const [backupType, setBackupType] = useConfig('backup_type', 'webdav');
    const [autoBackupFrequency, setAutoBackupFrequency] = useConfig('backup_auto_frequency', 'off');
    const [localBackupDirectory, setLocalBackupDirectory] = useConfig('backup_local_directory', '');
    const [davUserName, setDavUserName] = useConfig('webdav_username', '');
    const [davPassword, setDavPassword] = useConfig('webdav_password', '');
    const [davUrl, setDavUrl] = useConfig('webdav_url', '');
    const {
        isOpen: isWebDavListOpen,
        onOpen: onWebDavListOpen,
        onOpenChange: onWebDavListOpenChange,
    } = useDisclosure();
    const [uploading, setUploading] = useState(false);
    const [phrasesAction, setPhrasesAction] = useState('');
    const [vaultAction, setVaultAction] = useState('');
    const toastStyle = useToastStyle();
    const { t } = useTranslation();
    const effectiveBackupType = backupType === 'aliyun' ? 'webdav' : backupType;

    useEffect(() => {
        if (backupType === 'aliyun') {
            setBackupType('webdav', true);
        }
    }, [backupType]);

    const onSelectLocalDirectory = async () => {
        const selected = await open({
            multiple: false,
            directory: true,
        });
        if (typeof selected === 'string') {
            setLocalBackupDirectory(selected);
        }
    };

    const onBackup = async () => {
        setUploading(true);
        const time = new Date();
        const fileName = `${osType}-${time.getFullYear()}-${
            time.getMonth() + 1
        }-${time.getDate()}-${time.getHours()}-${time.getMinutes()}-${time.getSeconds()}`;

        let result;
        switch (effectiveBackupType) {
            case 'webdav':
                result = webdav.backup(davUrl, davUserName, davPassword, fileName + '.zip');
                break;
            case 'local':
                result = local.backup(fileName);
                break;
            default:
                warn('Unknown backup type');
                setUploading(false);
                return;
        }
        result.then(
            (value) => {
                if (value !== null) {
                    toast.success(t('config.backup.backup_success'), { style: toastStyle });
                }
                setUploading(false);
            },
            (e) => {
                toast.error(e.toString(), { style: toastStyle });
                setUploading(false);
            }
        );
    };

    const onBackupListOpen = () => {
        switch (effectiveBackupType) {
            case 'webdav':
                onWebDavListOpen();
                break;
            case 'local':
                local.get().then(
                    (value) => {
                        if (value !== null) {
                            toast.success(t('config.backup.load_success'), { style: toastStyle });
                        }
                    },
                    (e) => {
                        toast.error(e.toString(), { style: toastStyle });
                    }
                );
                break;
            default:
                warn('Unknown backup type');
        }
    };

    const onExportPhrases = async () => {
        setPhrasesAction('export');
        try {
            const result = await phraseTransfer.exportPhrases();
            if (result) {
                toast.success(t('config.backup.phrases_export_success'), { style: toastStyle });
            }
        } catch (e) {
            toast.error(t('config.backup.phrases_export_failed') + (e?.message ?? e), { style: toastStyle });
        } finally {
            setPhrasesAction('');
        }
    };

    const onImportPhrases = async () => {
        setPhrasesAction('import');
        try {
            const result = await phraseTransfer.importPhrases();
            if (result) {
                toast.success(
                    t('config.backup.phrases_import_success', {
                        imported: result.imported,
                        skipped: result.skipped,
                    }),
                    { style: toastStyle }
                );
            }
        } catch (e) {
            toast.error(t('config.backup.phrases_import_failed') + (e?.message ?? e), { style: toastStyle });
        } finally {
            setPhrasesAction('');
        }
    };

    const onExportVault = async () => {
        setVaultAction('export');
        try {
            const result = await vaultTransfer.exportVault();
            if (result) {
                toast.success(t('config.backup.vault_export_success'), { style: toastStyle });
            }
        } catch (e) {
            toast.error(t('config.backup.vault_export_failed') + (e?.message ?? e), { style: toastStyle });
        } finally {
            setVaultAction('');
        }
    };

    const onImportVault = async () => {
        setVaultAction('import');
        try {
            const result = await vaultTransfer.importVault();
            if (result) {
                toast.success(
                    t('config.backup.vault_import_success', {
                        imported: result.imported,
                        skipped: result.skipped,
                    }),
                    { style: toastStyle }
                );
            }
        } catch (e) {
            toast.error(t('config.backup.vault_import_failed') + (e?.message ?? e), { style: toastStyle });
        } finally {
            setVaultAction('');
        }
    };

    const sectionTitleClassName = 'my-auto text-foreground';
    const sectionControlClassName = 'flex w-full flex-col gap-3 sm:w-auto sm:min-w-[340px] sm:items-end';
    const actionRowClassName = 'flex flex-wrap gap-3 justify-start sm:justify-end';
    const actionButtonClassName = 'h-10 min-w-[112px] rounded-xl px-4 text-sm font-medium';
    const autoBackupEnabled = autoBackupFrequency && autoBackupFrequency !== 'off';
    const autoBackupFrequencyLabel = autoBackupFrequency
        ? t(`config.backup.auto_${autoBackupFrequency}`)
        : t('config.backup.auto_off');

    return (
        <Card className='mb-[10px]'>
            <Toaster />
            <CardBody className='gap-4'>
                <div>
                    <h2 className='text-[16px] font-semibold text-foreground'>
                        {t('config.backup.panel_title')}
                    </h2>
                </div>

                <div className='config-item'>
                    <h3 className={sectionTitleClassName}>
                        {t('config.backup.system_backup')}
                    </h3>
                    <div className={sectionControlClassName}>
                        {effectiveBackupType !== null && (
                            <SettingsDropdown
                                label={t(`config.backup.${effectiveBackupType}`)}
                                ariaLabel='backup type'
                                selectedKey={effectiveBackupType}
                                onAction={(key) => {
                                    setBackupType(key);
                                }}
                            >
                                <DropdownItem key='webdav'>{t('config.backup.webdav')}</DropdownItem>
                                <DropdownItem key='local'>{t('config.backup.local')}</DropdownItem>
                            </SettingsDropdown>
                        )}
                    </div>
                </div>

                {autoBackupFrequency !== null && (
                    <div className='config-item'>
                        <h3 className={sectionTitleClassName}>
                            {t('config.backup.auto_backup')}
                        </h3>
                        <div className={sectionControlClassName}>
                            <SettingsDropdown
                                label={autoBackupFrequencyLabel}
                                ariaLabel='auto backup frequency'
                                selectedKey={autoBackupFrequency}
                                onAction={(key) => {
                                    setAutoBackupFrequency(key);
                                }}
                            >
                                <DropdownItem key='off'>{t('config.backup.auto_off')}</DropdownItem>
                                <DropdownItem key='daily'>{t('config.backup.auto_daily')}</DropdownItem>
                                <DropdownItem key='weekly'>{t('config.backup.auto_weekly')}</DropdownItem>
                                <DropdownItem key='monthly'>{t('config.backup.auto_monthly')}</DropdownItem>
                            </SettingsDropdown>
                        </div>
                    </div>
                )}

                {autoBackupEnabled && effectiveBackupType === 'local' && (
                    <div className='config-item'>
                        <h3 className={sectionTitleClassName}>
                            {t('config.backup.local_directory')}
                        </h3>
                        <div className={sectionControlClassName}>
                            <div className={actionRowClassName}>
                                <Button
                                    variant='flat'
                                    color='default'
                                    className={actionButtonClassName}
                                    onPress={onSelectLocalDirectory}
                                >
                                    {localBackupDirectory
                                        ? t('config.backup.change_folder')
                                        : t('config.backup.choose_folder')}
                                </Button>
                            </div>
                            {localBackupDirectory ? (
                                <div className='max-w-[340px] truncate text-right text-xs text-default-500'>
                                    {localBackupDirectory}
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}

                {effectiveBackupType === 'webdav' && (
                    <>
                        <div className='config-item'>
                            <h3 className={sectionTitleClassName}>
                                {t('config.backup.webdav_url')}
                            </h3>
                            <div className={sectionControlClassName}>
                                {davUrl !== null && (
                                    <Input
                                        variant='bordered'
                                        value={davUrl}
                                        label={t('config.backup.webdav_url')}
                                        onValueChange={(v) => {
                                            setDavUrl(v);
                                        }}
                                        className='w-full max-w-[340px]'
                                    />
                                )}
                            </div>
                        </div>
                        <div className='config-item'>
                            <h3 className={sectionTitleClassName}>
                                {t('config.backup.username')}
                            </h3>
                            <div className={sectionControlClassName}>
                                {davUserName !== null && (
                                    <Input
                                        variant='bordered'
                                        value={davUserName}
                                        label={t('config.backup.username')}
                                        onValueChange={(v) => {
                                            setDavUserName(v);
                                        }}
                                        className='w-full max-w-[340px]'
                                    />
                                )}
                            </div>
                        </div>
                        <div className='config-item'>
                            <h3 className={sectionTitleClassName}>
                                {t('config.backup.password')}
                            </h3>
                            <div className={sectionControlClassName}>
                                {davPassword !== null && (
                                    <Input
                                        type='password'
                                        variant='bordered'
                                        value={davPassword}
                                        label={t('config.backup.password')}
                                        onValueChange={(v) => {
                                            setDavPassword(v);
                                        }}
                                        className='w-full max-w-[340px]'
                                    />
                                )}
                            </div>
                        </div>
                    </>
                )}

                <div className='config-item'>
                    <div />
                    <div className={sectionControlClassName}>
                        <div className={actionRowClassName}>
                            <Button
                                variant='flat'
                                color='default'
                                className={actionButtonClassName}
                                isLoading={uploading}
                                onPress={onBackup}
                            >
                                {t('config.backup.immediate_backup')}
                            </Button>
                            <Button
                                variant='flat'
                                color='default'
                                className={actionButtonClassName}
                                onPress={onBackupListOpen}
                            >
                                {t('config.backup.restore')}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className='config-item'>
                    <h3 className={sectionTitleClassName}>
                        {t('config.backup.phrases_data')}
                    </h3>
                    <div className={sectionControlClassName}>
                        <div className={actionRowClassName}>
                            <Button
                                variant='flat'
                                color='default'
                                className={actionButtonClassName}
                                isLoading={phrasesAction === 'export'}
                                isDisabled={phrasesAction !== ''}
                                onPress={onExportPhrases}
                            >
                                {t('config.backup.phrases_export')}
                            </Button>
                            <Button
                                variant='flat'
                                color='default'
                                className={actionButtonClassName}
                                isLoading={phrasesAction === 'import'}
                                isDisabled={phrasesAction !== ''}
                                onPress={onImportPhrases}
                            >
                                {t('config.backup.phrases_import')}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className='config-item'>
                    <h3 className={sectionTitleClassName}>
                        {t('config.backup.vault_data')}
                    </h3>
                    <div className={sectionControlClassName}>
                        <div className={actionRowClassName}>
                            <Button
                                variant='flat'
                                color='default'
                                className={actionButtonClassName}
                                isLoading={vaultAction === 'export'}
                                isDisabled={vaultAction !== ''}
                                onPress={onExportVault}
                            >
                                {t('config.backup.vault_export')}
                            </Button>
                            <Button
                                variant='flat'
                                color='default'
                                className={actionButtonClassName}
                                isLoading={vaultAction === 'import'}
                                isDisabled={vaultAction !== ''}
                                onPress={onImportVault}
                            >
                                {t('config.backup.vault_import')}
                            </Button>
                        </div>
                    </div>
                </div>
            </CardBody>
            <WebDavModal
                isOpen={isWebDavListOpen}
                onOpenChange={onWebDavListOpenChange}
                url={davUrl}
                username={davUserName}
                password={davPassword}
            />
        </Card>
    );
}
