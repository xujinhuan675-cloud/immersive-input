import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@nextui-org/react';
import { MdOutlineAutoAwesome } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import React from 'react';

import { AI_API_PROVIDER_TITLE, createAiApiInstanceKey } from '../../../../../../utils/aiConfig';

export default function SelectModal(props) {
    const { isOpen, onOpenChange, setCurrentConfigKey, onConfigOpen } = props;
    const { t } = useTranslation();

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            scrollBehavior='inside'
        >
            <ModalContent className='max-h-[80vh]'>
                {(onClose) => (
                    <>
                        <ModalHeader>{t('config.service.add_service')}</ModalHeader>
                        <ModalBody>
                            <Button
                                fullWidth
                                onPress={() => {
                                    setCurrentConfigKey(createAiApiInstanceKey());
                                    onConfigOpen();
                                    onClose();
                                }}
                                startContent={
                                    <div className='flex h-[24px] w-[24px] items-center justify-center rounded-[8px] bg-primary-100 text-primary'>
                                        <MdOutlineAutoAwesome className='text-[16px]' />
                                    </div>
                                }
                            >
                                <div className='w-full'>
                                    {t('ai_config.provider_title', { defaultValue: AI_API_PROVIDER_TITLE })}
                                </div>
                            </Button>
                        </ModalBody>
                        <ModalFooter>
                            <Button
                                color='danger'
                                variant='light'
                                onPress={onClose}
                            >
                                {t('common.cancel')}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
