import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import { BiTransferAlt } from 'react-icons/bi';
import React, { useEffect } from 'react';
import { atom, useAtom, useAtomValue } from 'jotai';

import { languageList } from '../../../../utils/language';
import { detectLanguageAtom } from '../SourceArea';
import { useConfig } from '../../../../hooks';

export const sourceLanguageAtom = atom();
export const targetLanguageAtom = atom();

export default function LanguageArea() {
    const [translateSourceLanguage] = useConfig('translate_source_language', 'auto');
    const [translateTargetLanguage, setTranslateTargetLanguage] = useConfig('translate_target_language', 'zh_cn');

    const [sourceLanguage, setSourceLanguage] = useAtom(sourceLanguageAtom);
    const [targetLanguage, setTargetLanguage] = useAtom(targetLanguageAtom);
    const detectLanguage = useAtomValue(detectLanguageAtom);
    const { t } = useTranslation();
    const languageButtonClass =
        'h-auto min-h-[38px] w-full justify-start rounded-[10px] px-3 py-2 text-default-700 transition-colors hover:bg-default-100 data-[hover=true]:bg-default-100';
    const detectedLanguageLabel =
        sourceLanguage === 'auto' && detectLanguage !== '' ? t(`languages.${detectLanguage}`) : null;

    useEffect(() => {
        if (translateSourceLanguage) {
            setSourceLanguage(translateSourceLanguage);
        }
        if (translateTargetLanguage) {
            setTargetLanguage(translateTargetLanguage);
        }
    }, [translateSourceLanguage, translateTargetLanguage]);

    return (
        <div className='rounded-[12px] border border-default-200/80 bg-content1/92 p-1'>
            <div className='flex items-center gap-1'>
                <div className='min-w-0 flex-1'>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                variant='light'
                                className={languageButtonClass}
                            >
                                <span className='flex min-w-0 flex-col items-start gap-0.5 text-left'>
                                    <span className='max-w-full truncate text-[13px] font-medium'>
                                        {t(`languages.${sourceLanguage}`)}
                                    </span>
                                    {detectedLanguageLabel ? (
                                        <span className='max-w-full truncate text-[11px] font-normal text-default-400'>
                                            {detectedLanguageLabel}
                                        </span>
                                    ) : null}
                                </span>
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label='Source Language'
                            className='max-h-[50vh] overflow-y-auto'
                            onAction={(key) => {
                                setSourceLanguage(key);
                            }}
                        >
                            <DropdownItem key='auto'>{t('languages.auto')}</DropdownItem>
                            {languageList.map((x) => {
                                return <DropdownItem key={x}>{t(`languages.${x}`)}</DropdownItem>;
                            })}
                        </DropdownMenu>
                    </Dropdown>
                </div>
                <div className='flex shrink-0'>
                    <Button
                        isIconOnly
                        size='sm'
                        variant='light'
                        className='h-8 w-8 min-w-0 rounded-[9px] border border-default-200/70 bg-default-50 text-[16px] text-default-500 transition-colors hover:bg-default-100 data-[hover=true]:bg-default-100'
                        onPress={async () => {
                            if (sourceLanguage !== 'auto') {
                                const oldSourceLanguage = sourceLanguage;
                                setSourceLanguage(targetLanguage);
                                setTargetLanguage(oldSourceLanguage);
                                return;
                            }

                            if (detectLanguage !== '') {
                                if (targetLanguage === translateTargetLanguage) {
                                    setTargetLanguage(detectLanguage);
                                } else {
                                    setTargetLanguage(translateTargetLanguage);
                                }
                            }
                        }}
                    >
                        <BiTransferAlt />
                    </Button>
                </div>
                <div className='min-w-0 flex-1'>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                variant='light'
                                className={languageButtonClass}
                            >
                                <span className='flex min-h-[26px] min-w-0 items-center text-left'>
                                    <span className='max-w-full truncate text-[13px] font-medium'>
                                        {t(`languages.${targetLanguage}`)}
                                    </span>
                                </span>
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label='Target Language'
                            className='max-h-[50vh] overflow-y-auto'
                            onAction={(key) => {
                                setTargetLanguage(key);
                                setTranslateTargetLanguage(key);
                            }}
                        >
                            {languageList.map((x) => {
                                return <DropdownItem key={x}>{t(`languages.${x}`)}</DropdownItem>;
                            })}
                        </DropdownMenu>
                    </Dropdown>
                </div>
            </div>
        </div>
    );
}
