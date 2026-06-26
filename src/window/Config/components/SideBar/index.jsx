import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import {
    MdOutlineAutoAwesome,
    MdOutlineHistory,
    MdOutlineInfo,
    MdOutlineKeyboardCommandKey,
    MdOutlineManageAccounts,
    MdOutlineTranslate,
    MdOutlineTune,
} from 'react-icons/md';
import { Button } from '@nextui-org/react';
import React, { useEffect, useState } from 'react';

import { clearResolvedUpdateReminder, getUpdateReminderState } from '../../../../utils/updateReminder';

const MENU = [
    { path: '/account', Icon: MdOutlineManageAccounts, key: 'account' },
    { path: '/ai', Icon: MdOutlineAutoAwesome, key: 'ai' },
    { path: '/general', Icon: MdOutlineTune, key: 'general' },
    { path: '/translate', Icon: MdOutlineTranslate, key: 'translate' },
    { path: '/hotkey', Icon: MdOutlineKeyboardCommandKey, key: 'hotkey' },
    { path: '/history', Icon: MdOutlineHistory, key: 'history' },
    { path: '/about', Icon: MdOutlineInfo, key: 'about' },
];

export default function SideBar() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const [hasUpdateReminder, setHasUpdateReminder] = useState(false);

    const isActive = (path) => location.pathname.includes(path);

    useEffect(() => {
        let disposed = false;

        async function syncUpdateReminder() {
            const state = await clearResolvedUpdateReminder();
            if (!disposed) {
                setHasUpdateReminder(Boolean(state.hasReminder));
            }
        }

        void syncUpdateReminder();
        const unlisten = listen('update_reminder_changed', async () => {
            const state = await getUpdateReminderState();
            if (!disposed) {
                setHasUpdateReminder(Boolean(state.hasReminder));
            }
        });

        return () => {
            disposed = true;
            void unlisten.then((off) => off());
        };
    }, []);

    return (
        <div className='flex flex-col items-center gap-1 overflow-y-auto px-3'>
            {MENU.map(({ path, Icon, key }) => {
                const active = isActive(path);

                return (
                    <Button
                        key={path}
                        size='lg'
                        variant='light'
                        className={`relative h-11 w-full justify-start rounded-lg px-4 ${
                            active ? 'bg-primary-50 text-primary-700' : 'text-default-600'
                        }`}
                        onPress={() => navigate(path)}
                    >
                        {active ? (
                            <span className='absolute left-0 top-2 h-7 w-[3px] rounded-r-full bg-primary' />
                        ) : null}
                        <div className='grid grid-cols-[22px_68px] items-center justify-center gap-x-3'>
                            <span className='flex w-[22px] shrink-0 justify-center'>
                                {key === 'about' && hasUpdateReminder ? (
                                    <span className='absolute left-[35px] top-[10px] h-2 w-2 rounded-full bg-danger shadow-[0_0_0_2px_white]' />
                                ) : null}
                                <Icon
                                    className={active ? 'text-primary' : 'text-default-400'}
                                    style={{ fontSize: 18, transition: 'color 0.15s' }}
                                />
                            </span>
                            <div
                                className={`w-[68px] text-center text-[15px] leading-none ${
                                    active ? 'font-semibold text-foreground' : 'font-normal text-default-600'
                                }`}
                            >
                                {t(`config.${key}.label`)}
                            </div>
                        </div>
                    </Button>
                );
            })}
        </div>
    );
}
