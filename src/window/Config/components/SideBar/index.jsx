import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    MdOutlineAutoAwesome,
    MdOutlineDns,
    MdOutlineHistory,
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
    { path: '/service', Icon: MdOutlineDns, key: 'service' },
    { path: '/history', Icon: MdOutlineHistory, key: 'history' },
];

export default function SideBar() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    const isActive = (path) => location.pathname.includes(path);

    return (
        <div className='mx-[12px] overflow-y-auto'>
            {MENU.map(({ path, Icon, key }) => (
                <Button
                    key={path}
                    fullWidth
                    size='lg'
                    variant={isActive(path) ? 'flat' : 'light'}
                    className='mb-[5px]'
                    onPress={() => navigate(path)}
                    startContent={
                        <Icon
                            className={isActive(path) ? 'text-primary' : 'text-default-400'}
                            style={{ fontSize: 20, transition: 'color 0.15s' }}
                        />
                    }
                >
                    <div
                        className={`w-full text-sm ${
                            isActive(path)
                                ? 'font-semibold text-foreground'
                                : 'font-normal text-default-600'
                        }`}
                    >
                        {t(`config.${key}.label`)}
                    </div>
                </Button>
            ))}
        </div>
    );
}
