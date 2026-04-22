import { DropdownItem } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { CardBody } from '@nextui-org/react';
import { Switch } from '@nextui-org/react';
import { Card } from '@nextui-org/react';
import React from 'react';

import SettingsDropdown from '../../../../components/SettingsDropdown';
import { languageList } from '../../../../utils/language';
import { useConfig } from '../../../../hooks';

export default function Recognize() {
    const [recognizeLanguage, setRecognizeLanguage] = useConfig('recognize_language', 'auto');
    const [deleteNewline, setDeleteNewline] = useConfig('recognize_delete_newline', false);
    const [autoCopy, setAutoCopy] = useConfig('recognize_auto_copy', false);
    const [hideWindow, setHideWindow] = useConfig('recognize_hide_window', false);
    const [closeOnBlur, setCloseOnBlur] = useConfig('recognize_close_on_blur', false);
    const { t } = useTranslation();
    return (
        <Card>
            <CardBody>
                <h2 className='mb-[10px] text-[16px] font-bold'>
                    {t('config.recognize.label')}
                </h2>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.recognize.language')}</h3>
                    {recognizeLanguage !== null && (
                        <SettingsDropdown
                            label={t(`languages.${recognizeLanguage}`)}
                            ariaLabel='recognize language'
                            selectedKey={recognizeLanguage}
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
                </div>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.recognize.delete_newline')}</h3>
                    {deleteNewline !== null && (
                        <Switch
                            isSelected={deleteNewline}
                            onValueChange={(v) => {
                                setDeleteNewline(v);
                            }}
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.recognize.auto_copy')}</h3>
                    {autoCopy !== null && (
                        <Switch
                            isSelected={autoCopy}
                            onValueChange={(v) => {
                                setAutoCopy(v);
                            }}
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.recognize.close_on_blur')}</h3>
                    {closeOnBlur !== null && (
                        <Switch
                            isSelected={closeOnBlur}
                            onValueChange={(v) => {
                                setCloseOnBlur(v);
                            }}
                        />
                    )}
                </div>
                <div className='config-item'>
                    <h3 className='my-auto mx-0'>{t('config.recognize.hide_window')}</h3>
                    {hideWindow !== null && (
                        <Switch
                            isSelected={hideWindow}
                            onValueChange={(v) => {
                                setHideWindow(v);
                            }}
                        />
                    )}
                </div>
            </CardBody>
        </Card>
    );
}
