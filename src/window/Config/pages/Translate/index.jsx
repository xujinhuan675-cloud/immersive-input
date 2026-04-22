import { DropdownItem } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { CardBody } from '@nextui-org/react';
import { Switch } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import React from 'react';

import SettingsDropdown from '../../../../components/SettingsDropdown';
import { languageList } from '../../../../utils/language';
import { useConfig } from '../../../../hooks/useConfig';
import { invoke } from '@tauri-apps/api';

export default function Translate() {
    const [sourceLanguage, setSourceLanguage] = useConfig('translate_source_language', 'auto');
    const [targetLanguage, setTargetLanguage] = useConfig('translate_target_language', 'zh_cn');
    const [autoCopy, setAutoCopy] = useConfig('translate_auto_copy', 'disable');
    const [incrementalTranslate, setIncrementalTranslate] = useConfig('incremental_translate', false);
    const [dynamicTranslate, setDynamicTranslate] = useConfig('dynamic_translate', false);
    const [deleteNewline, setDeleteNewline] = useConfig('translate_delete_newline', false);
    // const [translateFontSize, setTranslateFontSize] = useConfig('translate_font_size', 16);
    const { t } = useTranslation();

    return (
        <Card>
            <CardBody>
                <h2 className='mb-[10px] text-[16px] font-bold'>
                    {t('config.translate.label')}
                </h2>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.translate.source_language')}</h3>
                    {sourceLanguage !== null && (
                        <SettingsDropdown
                            label={t(`languages.${sourceLanguage}`)}
                            ariaLabel='source language'
                            selectedKey={sourceLanguage}
                            menuClassName='max-h-[50vh] overflow-y-auto'
                            onAction={(key) => {
                                setSourceLanguage(key);
                            }}
                        >
                            <DropdownItem key='auto'>{t('languages.auto')}</DropdownItem>
                            {languageList.map((item) => {
                                return <DropdownItem key={item}>{t(`languages.${item}`)}</DropdownItem>;
                            })}
                        </SettingsDropdown>
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.translate.target_language')}</h3>
                    {targetLanguage !== null && (
                        <SettingsDropdown
                            label={t(`languages.${targetLanguage}`)}
                            ariaLabel='target language'
                            selectedKey={targetLanguage}
                            menuClassName='max-h-[50vh] overflow-y-auto'
                            onAction={(key) => {
                                setTargetLanguage(key);
                            }}
                        >
                            {languageList.map((item) => {
                                return <DropdownItem key={item}>{t(`languages.${item}`)}</DropdownItem>;
                            })}
                        </SettingsDropdown>
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.translate.auto_copy')}</h3>
                    {autoCopy !== null && (
                        <SettingsDropdown
                            label={t(`config.translate.${autoCopy}`)}
                            ariaLabel='auto copy'
                            selectedKey={autoCopy}
                            menuClassName='max-h-[50vh] overflow-y-auto'
                            onAction={(key) => {
                                setAutoCopy(key);
                                invoke('update_tray', { language: '', copyMode: key });
                            }}
                        >
                            <DropdownItem key='source'>{t('config.translate.source')}</DropdownItem>
                            <DropdownItem key='target'>{t('config.translate.target')}</DropdownItem>
                            <DropdownItem key='source_target'>
                                {t('config.translate.source_target')}
                            </DropdownItem>
                            <DropdownItem key='disable'>{t('config.translate.disable')}</DropdownItem>
                        </SettingsDropdown>
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.translate.incremental_translate')}</h3>
                    {incrementalTranslate !== null && (
                        <Switch
                            isSelected={incrementalTranslate}
                            onValueChange={(v) => {
                                setIncrementalTranslate(v);
                            }}
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.translate.dynamic_translate')}</h3>
                    {dynamicTranslate !== null && (
                        <Switch
                            isSelected={dynamicTranslate}
                            onValueChange={(v) => {
                                setDynamicTranslate(v);
                            }}
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.translate.delete_newline')}</h3>
                    {deleteNewline !== null && (
                        <Switch
                            isSelected={deleteNewline}
                            onValueChange={(v) => {
                                setDeleteNewline(v);
                            }}
                        />
                    )}
                </div>
            </CardBody>
        </Card>
    );
}
