import { useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { DropdownItem } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { CardBody } from '@nextui-org/react';
import { warn } from 'tauri-plugin-log-api';
import { Button } from '@nextui-org/react';
import { Input } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import { Avatar } from '@nextui-org/react';
import React, { useEffect, useState } from 'react';

import SettingsDropdown from '../../../../components/SettingsDropdown';
import { useConfig, useToastStyle } from '../../../../hooks';
import { osType } from '../../../../utils/env';
import * as webdav from './utils/webdav';
import WebDavModal from './WebDavModal';
import AliyunModal from './AliyunModal';
import * as local from './utils/local';
import * as phraseTransfer from './utils/phrases';
import * as vaultTransfer from './utils/vault';
import * as aliyun from './utils/aliyun';

let refreshTimer = null;

export default function Backup() {
    const [backupType, setBackupType] = useConfig('backup_type', 'webdav');
    const [davUserName, setDavUserName] = useConfig('webdav_username', '');
    const [davPassword, setDavPassword] = useConfig('webdav_password', '');
    const [davUrl, setDavUrl] = useConfig('webdav_url', '');
    const [aliyunQrCodeUrl, setAliyunQrCodeUrl] = useState('');
    const [aliyunUserInfo, setAliyunUserInfo] = useState(null);
    const [aliyunAccessToken, setAliyunAccessToken] = useConfig('aliyun_access_token', '');
    // const [aliyunRefreshToken, setAliyunRefreshToken] = useConfig('aliyun_refresh_token', '');
    const {
        isOpen: isWebDavListOpen,
        onOpen: onWebDavListOpen,
        onOpenChange: onWebDavListOpenChange,
    } = useDisclosure();
    const {
        isOpen: isAliyunListOpen,
        onOpen: onAliyunListOpen,
        onOpenChange: onAliyunListOpenChange,
    } = useDisclosure();
    const [uploading, setUploading] = useState(false);
    const [phrasesAction, setPhrasesAction] = useState('');
    const [vaultAction, setVaultAction] = useState('');
    const toastStyle = useToastStyle();
    const { t } = useTranslation();

    const onBackup = async () => {
        setUploading(true);
        const time = new Date();
        const fileName = `${osType}-${time.getFullYear()}-${
            time.getMonth() + 1
        }-${time.getDate()}-${time.getHours()}-${time.getMinutes()}-${time.getSeconds()}`;

        let result;
        switch (backupType) {
            case 'webdav':
                result = webdav.backup(davUrl, davUserName, davPassword, fileName + '.zip');
                break;
            case 'local':
                result = local.backup(fileName);
                break;
            case 'aliyun':
                if (aliyunAccessToken === '') {
                    toast.error(t('config.backup.aliyun_login_first'), { style: toastStyle });
                    setUploading(false);
                } else {
                    result = aliyun.backup(aliyunAccessToken, fileName + '.zip');
                }
                break;
            default:
                warn('Unknown backup type');
                return;
        }
        result.then(
            () => {
                toast.success(t('config.backup.backup_success'), { style: toastStyle });
                setUploading(false);
            },
            (e) => {
                toast.error(e.toString(), { style: toastStyle });
                setUploading(false);
            }
        );
    };

    const onBackupListOpen = () => {
        switch (backupType) {
            case 'webdav':
                onWebDavListOpen();
                break;
            case 'local':
                local.get().then(
                    () => {
                        toast.success(t('config.backup.load_success'), { style: toastStyle });
                    },
                    (e) => {
                        toast.error(e.toString(), { style: toastStyle });
                    }
                );
                break;
            case 'aliyun':
                if (aliyunAccessToken === '') {
                    toast.error(t('config.backup.aliyun_login_first'), { style: toastStyle });
                } else {
                    onAliyunListOpen();
                }

                break;
            default:
                warn('Unknown backup type');
        }
    };

    const pollingStatus = async (sid) => {
        refreshTimer = setInterval(async () => {
            try {
                const { status, code } = await aliyun.status(sid);
                switch (status) {
                    case 'QRCodeExpired': {
                        refreshQrCode();
                        break;
                    }
                    case 'LoginSuccess': {
                        clearInterval(refreshTimer);
                        toast.success(t('config.backup.login_success'), { style: toastStyle });
                        const token = await aliyun.accessToken(code);
                        setAliyunAccessToken(token);
                        await refreshUserInfo(token);
                        break;
                    }
                }
            } catch (e) {
                toast.error(e.toString(), { style: toastStyle });
                refreshQrCode();
            }
        }, 2000);
    };

    const refreshQrCode = async () => {
        try {
            const { url, sid } = await aliyun.qrcode();
            setAliyunQrCodeUrl(url);
            if (refreshTimer) {
                clearInterval(refreshTimer);
            }
            pollingStatus(sid);
        } catch (e) {
            setAliyunQrCodeUrl('');
            toast.error(e.toString(), { style: toastStyle });
        }
    };

    const refreshUserInfo = async (token) => {
        try {
            const info = await aliyun.userInfo(token);
            setAliyunQrCodeUrl('');
            setAliyunUserInfo(info);
        } catch (e) {
            toast.error(e.toString(), { style: toastStyle });
            setAliyunAccessToken('');
            refreshQrCode();
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

    useEffect(() => {
        if (backupType === null || backupType !== 'aliyun') return;
        if (aliyunAccessToken === '') {
            refreshQrCode();
        } else {
            refreshUserInfo(aliyunAccessToken);
        }

        return () => {
            clearInterval(refreshTimer);
        };
    }, [backupType]);

    const sectionTitleClassName = 'my-auto text-foreground';
    const sectionControlClassName = 'flex w-full flex-col gap-3 sm:w-auto sm:min-w-[340px] sm:items-end';
    const rowClassName =
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between';
    const fieldWrapClassName = 'flex w-full flex-col gap-3';
    const actionRowClassName = 'flex flex-wrap gap-3 justify-start sm:justify-end';
    const actionButtonClassName = 'h-10 min-w-[112px] rounded-xl px-4 text-sm font-medium';

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
                        {backupType !== null && (
                            <SettingsDropdown
                                label={t(`config.backup.${backupType}`)}
                                ariaLabel='backup type'
                                selectedKey={backupType}
                                onAction={(key) => {
                                    setBackupType(key);
                                }}
                            >
                                <DropdownItem key='webdav'>{t('config.backup.webdav')}</DropdownItem>
                                <DropdownItem key='aliyun'>{t('config.backup.aliyun')}</DropdownItem>
                                <DropdownItem key='local'>{t('config.backup.local')}</DropdownItem>
                            </SettingsDropdown>
                        )}

                        <div className={fieldWrapClassName}>
                            <div className={backupType !== 'webdav' ? 'hidden' : 'space-y-3'}>
                                <div className={rowClassName}>
                                    <h4 className='pt-1 text-sm font-medium text-foreground'>
                                        {t('config.backup.webdav_url')}
                                    </h4>
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
                                <div className={rowClassName}>
                                    <h4 className='pt-1 text-sm font-medium text-foreground'>
                                        {t('config.backup.username')}
                                    </h4>
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
                                <div className={rowClassName}>
                                    <h4 className='pt-1 text-sm font-medium text-foreground'>
                                        {t('config.backup.password')}
                                    </h4>
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

                            <div className={backupType !== 'aliyun' ? 'hidden' : 'space-y-3'}>
                                {aliyunQrCodeUrl !== '' && (
                                    <div className='flex justify-center sm:justify-start'>
                                        <img
                                            src={aliyunQrCodeUrl}
                                            className='h-[200px] rounded-xl border border-default-100 bg-white p-2'
                                        />
                                    </div>
                                )}

                                {aliyunUserInfo !== null && (
                                    <div className={rowClassName}>
                                        <h4 className='pt-1 text-sm font-medium text-foreground'>
                                            {t('config.backup.username')}
                                        </h4>
                                        <Button
                                            variant='light'
                                            className='justify-start px-0 sm:px-2'
                                            onPress={() => {
                                                setAliyunAccessToken('');
                                                setAliyunUserInfo(null);
                                                refreshQrCode();
                                            }}
                                        >
                                            <Avatar
                                                src={aliyunUserInfo.avatar}
                                                size='sm'
                                            />
                                            <span className='text-sm'>{aliyunUserInfo.name}</span>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={actionRowClassName}>
                            <Button
                                variant='flat'
                                color='default'
                                className={actionButtonClassName}
                                isLoading={uploading}
                                onPress={onBackup}
                            >
                                {t('config.backup.backup')}
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
            <AliyunModal
                isOpen={isAliyunListOpen}
                onOpenChange={onAliyunListOpenChange}
                accessToken={aliyunAccessToken}
                // refreshToken={aliyunRefreshToken}
            />
        </Card>
    );
}
