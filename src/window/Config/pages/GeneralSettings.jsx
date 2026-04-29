import { enable, isEnabled, disable } from 'tauri-plugin-autostart-api';
import React, { useEffect, useMemo, useState } from 'react';
import { DropdownItem } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { CardBody } from '@nextui-org/react';
import { info } from 'tauri-plugin-log-api';
import { Switch } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import { invoke } from '@tauri-apps/api';
import { useTheme } from 'next-themes';

import SettingsDropdown from '../../../components/SettingsDropdown';
import { useConfig } from '../../../hooks/useConfig';
import { applyAppFont, buildAppFontStack, getCuratedFontList, isChineseCapableFont } from '../../../utils/appFont';
import { osType } from '../../../utils/env';
import Backup from './Backup';

const LANGUAGE_OPTIONS = [
    'zh_cn',
    'zh_tw',
    'en',
    'ja',
    'ko',
    'fr',
    'de',
    'es',
    'ru',
    'it',
    'tr',
    'pt_pt',
    'pt_br',
    'nb_no',
    'nn_no',
    'fa',
    'uk',
    'ar',
    'he',
];

const CHINESE_SUPPORT_BADGE = '\u652f\u6301\u4e2d\u6587';
const BADGE_FONT_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export default function GeneralSettings() {
    const [autoStart, setAutoStart] = useState(false);
    const [fontList, setFontList] = useState(null);
    const [autoStartBackground, setAutoStartBackground] = useConfig('auto_start_background', false);
    const [checkUpdate, setCheckUpdate] = useConfig('check_update', true);
    const [appLanguage, setAppLanguage] = useConfig('app_language', 'en');
    const [appTheme, setAppTheme] = useConfig('app_theme', 'system');
    const [appFont, setAppFont] = useConfig('app_font', 'default');
    const [trayClickEvent, setTrayClickEvent] = useConfig('tray_click_event', 'config');
    const { t, i18n } = useTranslation();
    const { setTheme } = useTheme();
    const fontOptions = useMemo(() => getCuratedFontList(fontList, appFont), [fontList, appFont]);

    const renderChineseSupportBadge = () => (
        <span
            className='rounded-full bg-default-100 px-2 py-0.5 text-[10px] font-medium leading-4 text-default-600'
            style={{ fontFamily: BADGE_FONT_STACK }}
        >
            {CHINESE_SUPPORT_BADGE}
        </span>
    );

    useEffect(() => {
        isEnabled().then((value) => {
            setAutoStart(value);
        });
        invoke('font_list').then((value) => {
            setFontList(value);
        });
    }, []);

    return (
        <>
            <Card className='mb-[10px]'>
                <CardBody>
                    <div className='config-item'>
                        <h3>{t('config.general.auto_start')}</h3>
                        <Switch
                            isSelected={autoStart}
                            onValueChange={(value) => {
                                setAutoStart(value);
                                if (value) {
                                    enable().then(() => {
                                        info('Auto start enabled');
                                    });
                                } else {
                                    disable().then(() => {
                                        info('Auto start disabled');
                                    });
                                }
                            }}
                        />
                    </div>
                    <div className='config-item'>
                        <h3>{t('config.general.auto_start_background')}</h3>
                        {autoStartBackground !== null && (
                            <Switch
                                isSelected={autoStartBackground}
                                onValueChange={(value) => {
                                    setAutoStartBackground(value);
                                }}
                            />
                        )}
                    </div>
                    <div className='config-item'>
                        <h3>{t('config.general.check_update')}</h3>
                        {checkUpdate !== null && (
                            <Switch
                                isSelected={checkUpdate}
                                onValueChange={(value) => {
                                    setCheckUpdate(value);
                                }}
                            />
                        )}
                    </div>
                </CardBody>
            </Card>
            <Card className='mb-[10px]'>
                <CardBody>
                    <div className='config-item'>
                        <h3 className='my-auto'>{t('config.general.app_language')}</h3>
                        {appLanguage !== null && (
                            <SettingsDropdown
                                label={t(`languages.${appLanguage}`)}
                                ariaLabel='app language'
                                selectedKey={appLanguage}
                                menuClassName='max-h-[40vh] overflow-y-auto'
                                onAction={(key) => {
                                    setAppLanguage(key);
                                    i18n.changeLanguage(key);
                                    invoke('update_tray', { language: key, copyMode: '' });
                                }}
                            >
                                {LANGUAGE_OPTIONS.map((languageKey) => (
                                    <DropdownItem key={languageKey}>
                                        {t(`languages.${languageKey}`)}
                                    </DropdownItem>
                                ))}
                            </SettingsDropdown>
                        )}
                    </div>
                    <div className='config-item'>
                        <h3 className='my-auto'>{t('config.general.app_theme')}</h3>
                        {appTheme !== null && (
                            <SettingsDropdown
                                label={t(`config.general.theme.${appTheme}`)}
                                ariaLabel='app theme'
                                selectedKey={appTheme}
                                onAction={(key) => {
                                    setAppTheme(key);
                                    if (key !== 'system') {
                                        setTheme(key);
                                    } else {
                                        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                                            setTheme('dark');
                                        } else {
                                            setTheme('light');
                                        }
                                        window
                                            .matchMedia('(prefers-color-scheme: dark)')
                                            .addEventListener('change', (event) => {
                                                if (event.matches) {
                                                    setTheme('dark');
                                                } else {
                                                    setTheme('light');
                                                }
                                            });
                                    }
                                }}
                            >
                                <DropdownItem key='system'>{t('config.general.theme.system')}</DropdownItem>
                                <DropdownItem key='light'>{t('config.general.theme.light')}</DropdownItem>
                                <DropdownItem key='dark'>{t('config.general.theme.dark')}</DropdownItem>
                            </SettingsDropdown>
                        )}
                    </div>
                    <div className='config-item'>
                        <h3 className='my-auto'>{t('config.general.app_font')}</h3>
                        {appFont !== null && fontList !== null && (
                            <SettingsDropdown
                                label={appFont === 'default' ? t('config.general.default_font') : appFont}
                                ariaLabel='app font'
                                selectedKey={appFont}
                                menuClassName='max-h-[50vh] overflow-y-auto'
                                onAction={(key) => {
                                    applyAppFont(key);
                                    setAppFont(key);
                                }}
                            >
                                <DropdownItem key='default' style={{ fontFamily: 'sans-serif' }} textValue='default'>
                                    {t('config.general.default_font')}
                                </DropdownItem>
                                {fontOptions.map((fontName) => {
                                    const fontSupportsChinese = isChineseCapableFont(fontName);

                                    return (
                                        <DropdownItem key={fontName} textValue={fontName}>
                                            <div className='flex items-center gap-2'>
                                                <span
                                                    className='truncate'
                                                    style={{ fontFamily: buildAppFontStack(fontName) }}
                                                >
                                                    {fontName}
                                                </span>
                                                {fontSupportsChinese && renderChineseSupportBadge()}
                                            </div>
                                        </DropdownItem>
                                    );
                                })}
                            </SettingsDropdown>
                        )}
                    </div>
                    <div className={`config-item ${osType !== 'Windows_NT' && 'hidden'}`}>
                        <h3 className='my-auto'>{t('config.general.tray_click_event')}</h3>
                        {trayClickEvent !== null && (
                            <SettingsDropdown
                                label={t(`config.general.event.${trayClickEvent}`)}
                                ariaLabel='tray click event'
                                selectedKey={trayClickEvent}
                                onAction={(key) => {
                                    setTrayClickEvent(key);
                                }}
                            >
                                <DropdownItem key='config'>{t('config.general.event.config')}</DropdownItem>
                                <DropdownItem key='translate'>{t('config.general.event.translate')}</DropdownItem>
                                <DropdownItem key='ocr_recognize'>
                                    {t('config.general.event.ocr_recognize')}
                                </DropdownItem>
                                <DropdownItem key='ocr_translate'>
                                    {t('config.general.event.ocr_translate')}
                                </DropdownItem>
                                <DropdownItem key='disable'>{t('config.general.event.disable')}</DropdownItem>
                            </SettingsDropdown>
                        )}
                    </div>
                </CardBody>
            </Card>
            <Backup />
        </>
    );
}
