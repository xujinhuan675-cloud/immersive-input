import { useCallback } from 'react';
import { useAtom } from 'jotai';

import { useGetState } from './useGetState';

export const useSyncAtom = (atom) => {
    const [atomValue, setAtomValue] = useAtom(atom);
    const [localValue, setLocalState, getLocalValue] = useGetState(atomValue);

    const setLocalValue = useCallback(
        (value, sync = false) => {
            if (typeof value === 'function') {
                if (sync) {
                    const nextValue = value(getLocalValue());
                    setLocalState(nextValue);
                    setAtomValue(nextValue);
                    return;
                }

                setLocalState((currentValue) => {
                    return value(currentValue);
                });
                return;
            }

            setLocalState(value);
            if (sync) {
                setAtomValue(value);
            }
        },
        [getLocalValue, setAtomValue, setLocalState]
    );

    const syncAtom = useCallback(
        (...args) => {
            if (args.length > 0) {
                setAtomValue(args[0]);
                return;
            }
            setAtomValue(getLocalValue());
        },
        [getLocalValue, setAtomValue]
    );

    return [localValue, setLocalValue, syncAtom];
};
