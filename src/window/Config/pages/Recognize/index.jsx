import { DropdownItem } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@nextui-org/react';
import React from 'react';

import SettingsDropdown from '../../../../components/SettingsDropdown';
import { languageList } from '../../../../utils/language';
import { useConfig } from '../../../../hooks';

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

export default function Recognize() {
    const [recognizeLanguage, setRecognizeLanguage] = useConfig('recognize_language', 'auto');
    const [deleteNewline, setDeleteNewline] = useConfig('recognize_delete_newline', false);
    const [autoCopy, setAutoCopy] = useConfig('recognize_auto_copy', false);
    const [hideWindow, setHideWindow] = useConfig('recognize_hide_window', false);
    const [closeOnBlur, setCloseOnBlur] = useConfig('recognize_close_on_blur', false);
    const { t } = useTranslation();
    return (
        <SettingSection>
            <SettingRow label={t('config.recognize.language')}>
                {recognizeLanguage !== null && (
                    <SettingsDropdown
                        label={t(`languages.${recognizeLanguage}`)}
                        ariaLabel='recognize language'
                        selectedKey={recognizeLanguage}
                        className={DROPDOWN_CLASS_NAME}
                        menuClassName='max-h-[50vh] overflow-y-auto'
                        onAction={(key) => {
                            setRecognizeLanguage(key);
                        }}
                    >
                        <DropdownItem key='auto'>{t('languages.auto')}</DropdownItem>
                        {languageList.map((item) => {
                            return <DropdownItem key={item}>{t(`languages.${item}`)}</DropdownItem>;
                        })}
                    </SettingsDropdown>
                )}
            </SettingRow>
            <SettingRow label={t('config.recognize.delete_newline')}>
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
            <SettingRow label={t('config.recognize.auto_copy')}>
                {autoCopy !== null && (
                    <Switch
                        size='sm'
                        isSelected={autoCopy}
                        onValueChange={(v) => {
                            setAutoCopy(v);
                        }}
                    />
                )}
            </SettingRow>
            <SettingRow label={t('config.recognize.close_on_blur')}>
                {closeOnBlur !== null && (
                    <Switch
                        size='sm'
                        isSelected={closeOnBlur}
                        onValueChange={(v) => {
                            setCloseOnBlur(v);
                        }}
                    />
                )}
            </SettingRow>
            <SettingRow label={t('config.recognize.hide_window')}>
                {hideWindow !== null && (
                    <Switch
                        size='sm'
                        isSelected={hideWindow}
                        onValueChange={(v) => {
                            setHideWindow(v);
                        }}
                    />
                )}
            </SettingRow>
        </SettingSection>
    );
}
