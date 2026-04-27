import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import React from 'react';

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

    const isActive = (path) => location.pathname.includes(path);

    return (
        <div className='flex flex-col items-center px-[7px] overflow-y-auto'>
            {MENU.map(({ path, Icon, key }) => (
                <Button
                    key={path}
                    size='lg'
                    variant={isActive(path) ? 'flat' : 'light'}
                    className='mb-[6px] w-[172px] px-0'
                    onPress={() => navigate(path)}
                >
                    <div className='grid grid-cols-[22px_68px] items-center justify-center gap-x-3'>
                        <span className='flex w-[22px] shrink-0 justify-center'>
                            <Icon
                                className={isActive(path) ? 'text-primary' : 'text-default-400'}
                                style={{ fontSize: 18, transition: 'color 0.15s' }}
                            />
                        </span>
                        <div
                            className={`w-[68px] text-center text-[15px] leading-none ${
                                isActive(path)
                                    ? 'font-semibold text-foreground'
                                    : 'font-normal text-default-600'
                            }`}
                        >
                            {t(`config.${key}.label`)}
                        </div>
                    </div>
                </Button>
            ))}
        </div>
    );
}
