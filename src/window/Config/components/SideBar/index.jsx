import { useNavigate, useLocation } from 'react-router-dom';
import { PiTranslateFill, PiTextboxFill } from 'react-icons/pi';
import { useTranslation } from 'react-i18next';
import {
    MdKeyboardAlt, MdExtension, MdAccountCircle,
    MdSettings, MdCloudUpload, MdInfo, MdHistory,
} from 'react-icons/md';
import { TbBrain, TbCursorText } from 'react-icons/tb';
import { Button } from '@nextui-org/react';
import React from 'react';

const MENU = [
    { path: '/account',  Icon: MdAccountCircle, key: 'account'  },
    { path: '/general',  Icon: MdSettings,      key: 'general'  },
    { path: '/translate',Icon: PiTranslateFill, key: 'translate'},
    { path: '/recognize',Icon: PiTextboxFill,   key: 'recognize'},
    { path: '/hotkey',   Icon: MdKeyboardAlt,   key: 'hotkey'  },
    { path: '/service',  Icon: MdExtension,     key: 'service' },
    { path: '/history',  Icon: MdHistory,       key: 'history' },
    { path: '/backup',   Icon: MdCloudUpload,   key: 'backup'  },
    { path: '/ai',            Icon: TbBrain,       key: 'ai'             },
    { path: '/text_selection', Icon: TbCursorText,  key: 'text_selection' },
    { path: '/about',          Icon: MdInfo,        key: 'about'          },
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
