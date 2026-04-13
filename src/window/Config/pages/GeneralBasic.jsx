import { enable, isEnabled, disable } from 'tauri-plugin-autostart-api';
import { DropdownTrigger } from '@nextui-org/react';
import React, { useState, useEffect } from 'react';
import { DropdownMenu } from '@nextui-org/react';
import { DropdownItem } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { CardBody } from '@nextui-org/react';
import { Dropdown } from '@nextui-org/react';
import { info } from 'tauri-plugin-log-api';
import { Button } from '@nextui-org/react';
import { Switch } from '@nextui-org/react';
import 'flag-icons/css/flag-icons.min.css';
import { Card } from '@nextui-org/react';
import { invoke } from '@tauri-apps/api';
import { useTheme } from 'next-themes';

import { useConfig } from '../../../hooks/useConfig';
import { LanguageFlag } from '../../../utils/language';
import { osType } from '../../../utils/env';

export default function GeneralBasic() {
    const [autoStart, setAutoStart] = useState(false);
    const [fontList, setFontList] = useState(null);
    const [checkUpdate, setCheckUpdate] = useConfig('check_update', true);
    const [appLanguage, setAppLanguage] = useConfig('app_language', 'en');
    const [appTheme, setAppTheme] = useConfig('app_theme', 'system');
    const [appFont, setAppFont] = useConfig('app_font', 'default');
    const [appFallbackFont, setAppFallbackFont] = useConfig('app_fallback_font', 'default');
    const [appFontSize, setAppFontSize] = useConfig('app_font_size', 16);
    const [trayClickEvent, setTrayClickEvent] = useConfig('tray_click_event', 'config');
    const { t, i18n } = useTranslation();
    const { setTheme } = useTheme();

    const languageName = {
        zh_cn: '绠€浣撲腑鏂?,
        zh_tw: '绻侀珨涓枃',
        en: 'English',
        ja: '鏃ユ湰瑾?,
        ko: '頃滉淡鞏?',
        fr: 'Fran莽ais',
        es: 'Espa帽ol',
        ru: '袪褍褋褋泻懈泄',
        de: 'Deutsch',
        it: 'Italiano',
        tr: 'T眉rk莽e',
        pt_pt: 'Portugu锚s',
        pt_br: 'Portugu锚s (Brasil)',
        nb_no: 'Norsk Bokm氓l',
        nn_no: 'Norsk Nynorsk',
        fa: '賮丕乇爻蹖',
        uk: '校泻褉邪褩薪褋褜泻邪',
        ar: '丕賱毓乇亘賷丞',
        he: '注执讘职专执讬转',
    };

    useEffect(() => {
        isEnabled().then((v) => {
            setAutoStart(v);
        });
        invoke('font_list').then((v) => {
            setFontList(v);
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
                            onValueChange={(v) => {
                                setAutoStart(v);
                                if (v) {
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
                        <h3>{t('config.general.check_update')}</h3>
                        {checkUpdate !== null && (
                            <Switch
                                isSelected={checkUpdate}
                                onValueChange={(v) => {
                                    setCheckUpdate(v);
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
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button
                                        variant='bordered'
                                        startContent={<span className={`fi fi-${LanguageFlag[appLanguage]}`} />}
                                    >
                                        {languageName[appLanguage]}
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu
                                    aria-label='app language'
                                    className='max-h-[40vh] overflow-y-auto'
                                    onAction={(key) => {
                                        setAppLanguage(key);
                                        i18n.changeLanguage(key);
                                        invoke('update_tray', { language: key, copyMode: '' });
                                    }}
                                >
                                    <DropdownItem
                                        key='zh_cn'
                                        startContent={<span className={`fi fi-${LanguageFlag.zh_cn}`} />}
                                    >
                                        绠€浣撲腑鏂?
                                    </DropdownItem>
                                    <DropdownItem
                                        key='zh_tw'
                                        startContent={<span className={`fi fi-${LanguageFlag.zh_cn}`} />}
                                    >
                                        绻侀珨涓枃
                                    </DropdownItem>
                                    <DropdownItem
                                        key='en'
                                        startContent={<span className={`fi fi-${LanguageFlag.en}`} />}
                                    >
                                        English
                                    </DropdownItem>
                                    <DropdownItem
                                        key='ja'
                                        startContent={<span className={`fi fi-${LanguageFlag.ja}`} />}
                                    >
                                        鏃ユ湰瑾?
                                    </DropdownItem>
                                    <DropdownItem
                                        key='ko'
                                        startContent={<span className={`fi fi-${LanguageFlag.ko}`} />}
                                    >
                                        頃滉淡鞏?
                                    </DropdownItem>
                                    <DropdownItem
                                        key='fr'
                                        startContent={<span className={`fi fi-${LanguageFlag.fr}`} />}
                                    >
                                        Fran莽ais
                                    </DropdownItem>
                                    <DropdownItem
                                        key='de'
                                        startContent={<span className={`fi fi-${LanguageFlag.de}`} />}
                                    >
                                        Deutsch
                                    </DropdownItem>
                                    <DropdownItem
                                        key='es'
                                        startContent={<span className={`fi fi-${LanguageFlag.es}`} />}
                                    >
                                        Espa帽ol
                                    </DropdownItem>
                                    <DropdownItem
                                        key='ru'
                                        startContent={<span className={`fi fi-${LanguageFlag.ru}`} />}
                                    >
                                        袪褍褋褋泻懈泄
                                    </DropdownItem>
                                    <DropdownItem
                                        key='it'
                                        startContent={<span className={`fi fi-${LanguageFlag.it}`} />}
                                    >
                                        Italiano
                                    </DropdownItem>
                                    <DropdownItem
                                        key='tr'
                                        startContent={<span className={`fi fi-${LanguageFlag.tr}`} />}
                                    >
                                        T眉rk莽e
                                    </DropdownItem>
                                    <DropdownItem
                                        key='pt_pt'
                                        startContent={<span className={`fi fi-${LanguageFlag.pt_pt}`} />}
                                    >
                                        Portugu锚s
                                    </DropdownItem>
                                    <DropdownItem
                                        key='pt_br'
                                        startContent={<span className={`fi fi-${LanguageFlag.pt_br}`} />}
                                    >
                                        Portugu锚s (Brasil)
                                    </DropdownItem>
                                    <DropdownItem
                                        key='nb_no'
                                        startContent={<span className={`fi fi-${LanguageFlag.nb_no}`} />}
                                    >
                                        Norsk Bokm氓l
                                    </DropdownItem>
                                    <DropdownItem
                                        key='nn_no'
                                        startContent={<span className={`fi fi-${LanguageFlag.nn_no}`} />}
                                    >
                                        Norsk Nynorsk
                                    </DropdownItem>
                                    <DropdownItem
                                        key='fa'
                                        startContent={<span className={`fi fi-${LanguageFlag.fa}`} />}
                                    >
                                        賮丕乇爻蹖
                                    </DropdownItem>
                                    <DropdownItem
                                        key='uk'
                                        startContent={<span className={`fi fi-${LanguageFlag.uk}`} />}
                                    >
                                        校泻褉邪褩薪褋褜泻邪
                                    </DropdownItem>
                                    <DropdownItem
                                        key='ar'
                                        startContent={<span className={`fi fi-${LanguageFlag.ar}`} />}
                                    >
                                        丕賱毓乇亘賷丞
                                    </DropdownItem>
                                    <DropdownItem
                                        key='he'
                                        startContent={<span className={`fi fi-${LanguageFlag.he}`} />}
                                    >
                                        注执讘职专执讬转
                                    </DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        )}
                    </div>
                    <div className='config-item'>
                        <h3 className='my-auto'>{t('config.general.app_theme')}</h3>
                        {appTheme !== null && (
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button variant='bordered'>{t(`config.general.theme.${appTheme}`)}</Button>
                                </DropdownTrigger>
                                <DropdownMenu
                                    aria-label='app theme'
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
                                                .addEventListener('change', (e) => {
                                                    if (e.matches) {
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
                                </DropdownMenu>
                            </Dropdown>
                        )}
                    </div>
                    <div className='config-item'>
                        <h3 className='my-auto'>{t('config.general.app_font')}</h3>
                        {appFont !== null && fontList !== null && (
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button
                                        variant='bordered'
                                        style={{
                                            fontFamily: appFont === 'default' ? 'sans-serif' : appFont,
                                        }}
                                    >
                                        {appFont === 'default' ? t('config.general.default_font') : appFont}
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu
                                    aria-label='app font'
                                    className='max-h-[50vh] overflow-y-auto'
                                    onAction={(key) => {
                                        document.documentElement.style.fontFamily = `"${
                                            key === 'default' ? 'sans-serif' : key
                                        }","${appFallbackFont === 'default' ? 'sans-serif' : appFallbackFont}"`;
                                        setAppFont(key);
                                    }}
                                >
                                    <DropdownItem style={{ fontFamily: 'sans-serif' }} key='default'>
                                        {t('config.general.default_font')}
                                    </DropdownItem>
                                    {fontList.map((x) => {
                                        return (
                                            <DropdownItem style={{ fontFamily: x }} key={x}>
                                                {x}
                                            </DropdownItem>
                                        );
                                    })}
                                </DropdownMenu>
                            </Dropdown>
                        )}
                    </div>
                    <div className='config-item'>
                        <h3 className='my-auto'>{t('config.general.app_fallback_font')}</h3>
                        {appFallbackFont !== null && fontList !== null && (
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button
                                        variant='bordered'
                                        style={{
                                            fontFamily: appFallbackFont === 'default' ? 'sans-serif' : appFallbackFont,
                                        }}
                                    >
                                        {appFallbackFont === 'default'
                                            ? t('config.general.default_font')
                                            : appFallbackFont}
                                    </Button>
                                </DropdownTrigger>
                                <DropdownMenu
                                    aria-label='app font'
                                    className='max-h-[50vh] overflow-y-auto'
                                    onAction={(key) => {
                                        document.documentElement.style.fontFamily = `"${
                                            appFont === 'default' ? 'sans-serif' : appFont
                                        }","${key === 'default' ? 'sans-serif' : key}"`;
                                        setAppFallbackFont(key);
                                    }}
                                >
                                    <DropdownItem style={{ fontFamily: 'sans-serif' }} key='default'>
                                        {t('config.general.default_font')}
                                    </DropdownItem>
                                    {fontList.map((x) => {
                                        return (
                                            <DropdownItem style={{ fontFamily: x }} key={x}>
                                                {x}
                                            </DropdownItem>
                                        );
                                    })}
                                </DropdownMenu>
                            </Dropdown>
                        )}
                    </div>
                    <div className='config-item'>
                        <h3 className='my-auto mx-0'>{t('config.general.font_size.title')}</h3>
                        {appFontSize !== null && (
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button variant='bordered'>{t(`config.general.font_size.${appFontSize}`)}</Button>
                                </DropdownTrigger>
                                <DropdownMenu
                                    aria-label='window position'
                                    className='max-h-[50vh] overflow-y-auto'
                                    onAction={(key) => {
                                        document.documentElement.style.fontSize = `${key}px`;
                                        setAppFontSize(key);
                                    }}
                                >
                                    <DropdownItem key={10}>{t(`config.general.font_size.10`)}</DropdownItem>
                                    <DropdownItem key={12}>{t(`config.general.font_size.12`)}</DropdownItem>
                                    <DropdownItem key={14}>{t(`config.general.font_size.14`)}</DropdownItem>
                                    <DropdownItem key={16}>{t(`config.general.font_size.16`)}</DropdownItem>
                                    <DropdownItem key={18}>{t(`config.general.font_size.18`)}</DropdownItem>
                                    <DropdownItem key={20}>{t(`config.general.font_size.20`)}</DropdownItem>
                                    <DropdownItem key={24}>{t(`config.general.font_size.24`)}</DropdownItem>
                                </DropdownMenu>
                            </Dropdown>
                        )}
                    </div>
                    <div className={`config-item ${osType !== 'Windows_NT' && 'hidden'}`}>
                        <h3 className='my-auto'>{t('config.general.tray_click_event')}</h3>
                        {trayClickEvent !== null && (
                            <Dropdown>
                                <DropdownTrigger>
                                    <Button variant='bordered'>{t(`config.general.event.${trayClickEvent}`)}</Button>
                                </DropdownTrigger>
                                <DropdownMenu
                                    aria-label='tray click event'
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
                                </DropdownMenu>
                            </Dropdown>
                        )}
                    </div>
                </CardBody>
            </Card>
        </>
    );
}
