import { enable, isEnabled, disable } from 'tauri-plugin-autostart-api';
import React, { useEffect, useMemo, useState } from 'react';
import { DropdownItem, Switch } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { info } from 'tauri-plugin-log-api';
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
const DROPDOWN_CLASS_NAME = 'h-10 w-[176px] rounded-lg px-3 py-0 shadow-none';

function SettingSection({ children }) {
    return (
        <section className='overflow-hidden rounded-xl border border-default-200/80 bg-content1'>{children}</section>
    );
}

function SettingRow({ label, hidden = false, children }) {
    if (hidden) {
        return null;
    }

    return (
        <div className='flex min-h-[58px] items-center justify-between gap-5 border-b border-default-100 px-5 py-3 last:border-b-0'>
            <h3 className='text-[14px] font-medium text-foreground'>{label}</h3>
            <div className='flex shrink-0 items-center justify-end'>{children}</div>
        </div>
    );
}

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
        <div className='space-y-3 pb-4'>
            <SettingSection>
                <SettingRow label={t('config.general.auto_start')}>
                    <Switch
                        size='sm'
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
                </SettingRow>
                <SettingRow label={t('config.general.auto_start_background')}>
                    {autoStartBackground !== null && (
                        <Switch
                            size='sm'
                            isSelected={autoStartBackground}
                            onValueChange={(value) => {
                                setAutoStartBackground(value);
                            }}
                        />
                    )}
                </SettingRow>
                <SettingRow label={t('config.general.check_update')}>
                    {checkUpdate !== null && (
                        <Switch
                            size='sm'
                            isSelected={checkUpdate}
                            onValueChange={(value) => {
                                setCheckUpdate(value);
                            }}
                        />
                    )}
                </SettingRow>
            </SettingSection>

            <SettingSection>
                <SettingRow label={t('config.general.app_language')}>
                    {appLanguage !== null && (
                        <SettingsDropdown
                            label={t(`languages.${appLanguage}`)}
                            ariaLabel='app language'
                            selectedKey={appLanguage}
                            className={DROPDOWN_CLASS_NAME}
                            menuClassName='max-h-[40vh] overflow-y-auto'
                            onAction={(key) => {
                                setAppLanguage(key);
                                i18n.changeLanguage(key);
                                invoke('update_tray', { language: key, copyMode: '' });
                            }}
                        >
                            {LANGUAGE_OPTIONS.map((languageKey) => (
                                <DropdownItem key={languageKey}>{t(`languages.${languageKey}`)}</DropdownItem>
                            ))}
                        </SettingsDropdown>
                    )}
                </SettingRow>
                <SettingRow label={t('config.general.app_theme')}>
                    {appTheme !== null && (
                        <SettingsDropdown
                            label={t(`config.general.theme.${appTheme}`)}
                            ariaLabel='app theme'
                            selectedKey={appTheme}
                            className={DROPDOWN_CLASS_NAME}
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
                </SettingRow>
                <SettingRow label={t('config.general.app_font')}>
                    {appFont !== null && fontList !== null && (
                        <SettingsDropdown
                            label={appFont === 'default' ? t('config.general.default_font') : appFont}
                            ariaLabel='app font'
                            selectedKey={appFont}
                            className={DROPDOWN_CLASS_NAME}
                            menuClassName='max-h-[50vh] overflow-y-auto'
                            onAction={(key) => {
                                applyAppFont(key);
                                setAppFont(key);
                            }}
                        >
                            <DropdownItem
                                key='default'
                                style={{ fontFamily: 'sans-serif' }}
                                textValue='default'
                            >
                                {t('config.general.default_font')}
                            </DropdownItem>
                            {fontOptions.map((fontName) => {
                                const fontSupportsChinese = isChineseCapableFont(fontName);

                                return (
                                    <DropdownItem
                                        key={fontName}
                                        textValue={fontName}
                                    >
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
                </SettingRow>
                <SettingRow
                    label={t('config.general.tray_click_event')}
                    hidden={osType !== 'Windows_NT'}
                >
                    {trayClickEvent !== null && (
                        <SettingsDropdown
                            label={t(`config.general.event.${trayClickEvent}`)}
                            ariaLabel='tray click event'
                            selectedKey={trayClickEvent}
                            className={DROPDOWN_CLASS_NAME}
                            onAction={(key) => {
                                setTrayClickEvent(key);
                            }}
                        >
                            <DropdownItem key='config'>{t('config.general.event.config')}</DropdownItem>
                            <DropdownItem key='translate'>{t('config.general.event.translate')}</DropdownItem>
                            <DropdownItem key='ocr_recognize'>{t('config.general.event.ocr_recognize')}</DropdownItem>
                            <DropdownItem key='ocr_translate'>{t('config.general.event.ocr_translate')}</DropdownItem>
                            <DropdownItem key='disable'>{t('config.general.event.disable')}</DropdownItem>
                        </SettingsDropdown>
                    )}
                </SettingRow>
            </SettingSection>
            <Backup />
        </div>
    );
}
