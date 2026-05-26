import { DropdownItem } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@nextui-org/react';
import React from 'react';

import SettingsDropdown from '../../../../components/SettingsDropdown';
import { languageList } from '../../../../utils/language';
import { useConfig } from '../../../../hooks/useConfig';
import { invoke } from '@tauri-apps/api';

const DROPDOWN_CLASS_NAME = 'h-10 w-[176px] rounded-lg px-3 py-0 shadow-none';

function SettingSection({ children }) {
    return (
        <section className='overflow-hidden rounded-xl border border-default-200/80 bg-content1'>{children}</section>
    );
}

function SettingRow({ label, children }) {
    return (
        <div className='flex min-h-[58px] items-center justify-between gap-5 border-b border-default-100 px-5 py-3 last:border-b-0'>
            <h3 className='text-[14px] font-medium text-foreground'>{label}</h3>
            <div className='flex shrink-0 items-center justify-end'>{children}</div>
        </div>
    );
}

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
        <SettingSection>
            <SettingRow label={t('config.translate.source_language')}>
                {sourceLanguage !== null && (
                    <SettingsDropdown
                        label={t(`languages.${sourceLanguage}`)}
                        ariaLabel='source language'
                        selectedKey={sourceLanguage}
                        className={DROPDOWN_CLASS_NAME}
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
            </SettingRow>
            <SettingRow label={t('config.translate.target_language')}>
                {targetLanguage !== null && (
                    <SettingsDropdown
                        label={t(`languages.${targetLanguage}`)}
                        ariaLabel='target language'
                        selectedKey={targetLanguage}
                        className={DROPDOWN_CLASS_NAME}
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
            </SettingRow>
            <SettingRow label={t('config.translate.auto_copy')}>
                {autoCopy !== null && (
                    <SettingsDropdown
                        label={t(`config.translate.${autoCopy}`)}
                        ariaLabel='auto copy'
                        selectedKey={autoCopy}
                        className={DROPDOWN_CLASS_NAME}
                        menuClassName='max-h-[50vh] overflow-y-auto'
                        onAction={(key) => {
                            setAutoCopy(key);
                            invoke('update_tray', { language: '', copyMode: key });
                        }}
                    >
                        <DropdownItem key='source'>{t('config.translate.source')}</DropdownItem>
                        <DropdownItem key='target'>{t('config.translate.target')}</DropdownItem>
                        <DropdownItem key='source_target'>{t('config.translate.source_target')}</DropdownItem>
                        <DropdownItem key='disable'>{t('config.translate.disable')}</DropdownItem>
                    </SettingsDropdown>
                )}
            </SettingRow>
            <SettingRow label={t('config.translate.incremental_translate')}>
                {incrementalTranslate !== null && (
                    <Switch
                        size='sm'
                        isSelected={incrementalTranslate}
                        onValueChange={(v) => {
                            setIncrementalTranslate(v);
                        }}
                    />
                )}
            </SettingRow>
            <SettingRow label={t('config.translate.dynamic_translate')}>
                {dynamicTranslate !== null && (
                    <Switch
                        size='sm'
                        isSelected={dynamicTranslate}
                        onValueChange={(v) => {
                            setDynamicTranslate(v);
                        }}
                    />
                )}
            </SettingRow>
            <SettingRow label={t('config.translate.delete_newline')}>
                {deleteNewline !== null && (
                    <Switch
                        size='sm'
                        isSelected={deleteNewline}
                        onValueChange={(v) => {
                            setDeleteNewline(v);
                        }}
                    />
                )}
            </SettingRow>
        </SettingSection>
    );
}
