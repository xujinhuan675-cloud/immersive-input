import { Modal, ModalBody, ModalContent, ModalHeader, Spacer } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { LuVolume2 } from 'react-icons/lu';

import SpeechConfigPanel from '../SpeechConfigPanel';

export default function SpeechConfigModal(props) {
    const { isOpen, onOpenChange, providerId = null, title = null } = props;
    const { t } = useTranslation();

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} scrollBehavior='inside'>
            <ModalContent className='max-h-[80vh]'>
                {(onClose) => (
                    <>
                        <ModalHeader>
                            <div className='flex items-center'>
                                <div className='flex h-[28px] w-[28px] items-center justify-center rounded-[10px] bg-primary-100 text-primary'>
                                    <LuVolume2 className='text-[16px]' />
                                </div>
                                <Spacer x={2} />
                                {title ||
                                    t('ai_config.speech_service_item_title', {
                                        defaultValue: 'Speech Configuration',
                                    })}
                            </div>
                        </ModalHeader>
                        <ModalBody>
                            <SpeechConfigPanel
                                showTitle={false}
                                showGeneralSection={providerId === null}
                                initialProvider={providerId}
                                onSaved={() => onClose()}
                            />
                        </ModalBody>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
