import { Divider, Button } from '@nextui-org/react';
import { appLogDir, appConfigDir } from '@tauri-apps/api/path';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/api/shell';
import { BsTelegram } from 'react-icons/bs';
import { invoke } from '@tauri-apps/api';
import React, { useEffect, useState } from 'react';

import { appVersion } from '../../../../utils/env';
import { clearResolvedUpdateReminder, getUpdateReminderState } from '../../../../utils/updateReminder';

export default function About() {
    const { t } = useTranslation();
    const [updateReminder, setUpdateReminder] = useState({
        hasReminder: false,
        restartReady: false,
        updateVersion: '',
    });

    useEffect(() => {
        let disposed = false;

        async function syncUpdateReminder() {
            const state = await clearResolvedUpdateReminder();
            if (!disposed) {
                setUpdateReminder(state);
            }
        }

        void syncUpdateReminder();
        const unlisten = listen('update_reminder_changed', async () => {
            const state = await getUpdateReminderState();
            if (!disposed) {
                setUpdateReminder(state);
            }
        });

        return () => {
            disposed = true;
            void unlisten.then((off) => off());
        };
    }, []);

    const updateReminderText = updateReminder.restartReady
        ? `新版本${updateReminder.updateVersion ? ` ${updateReminder.updateVersion}` : ''}已准备好，重启后完成更新。`
        : `发现新版本${updateReminder.updateVersion ? ` ${updateReminder.updateVersion}` : ''}，建议尽快更新。`;

    return (
        <div className='h-full w-full py-[80px] px-[100px]'>
            <img
                src='icon.svg'
                className='mx-auto h-[100px] mb-[5px]'
                draggable={false}
            />
            <div className='content-center'>
                <h1 className='font-bold text-2xl text-center'>Flow Input</h1>
                <p className='text-center text-sm text-gray-500 mb-[5px]'>{appVersion}</p>
                {updateReminder.hasReminder ? (
                    <button
                        type='button'
                        className='mx-auto mb-3 flex max-w-[360px] items-center justify-center gap-2 rounded-full border border-danger-200 bg-danger-50 px-4 py-2 text-center text-[12px] font-medium text-danger-700'
                        onClick={() => {
                            invoke('updater_window');
                        }}
                    >
                        <span className='h-2 w-2 shrink-0 rounded-full bg-danger' />
                        <span>{updateReminderText}</span>
                    </button>
                ) : null}
                <Divider />
                <div className='flex justify-center gap-4'>
                    <Button
                        variant='light'
                        className='my-[5px]'
                        size='sm'
                        startContent={<BsTelegram />}
                        onPress={() => {
                            open('https://t.me/flowinput');
                        }}
                    >
                        @flowinput
                    </Button>
                </div>
                <Divider />
            </div>
            <div className='content-center px-[40px]'>
                <div className='flex justify-between'>
                    <Button
                        variant='light'
                        className='my-[5px]'
                        size='sm'
                        onPress={() => {
                            invoke('updater_window');
                        }}
                    >
                        {t('config.about.check_update')}
                    </Button>
                    <Button
                        variant='light'
                        className='my-[5px]'
                        size='sm'
                        onPress={async () => {
                            const dir = await appLogDir();
                            open(dir);
                        }}
                    >
                        {t('config.about.view_log')}
                    </Button>
                    <Button
                        variant='light'
                        className='my-[5px]'
                        size='sm'
                        onPress={async () => {
                            const dir = await appConfigDir();
                            open(dir);
                        }}
                    >
                        {t('config.about.view_config')}
                    </Button>
                </div>

                <Divider />
            </div>
        </div>
    );
}
