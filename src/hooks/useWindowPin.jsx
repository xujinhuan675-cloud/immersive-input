import { appWindow } from '@tauri-apps/api/window';
import { useCallback, useState } from 'react';

export function useWindowPin() {
    const [pined, setPined] = useState(false);

    const togglePin = useCallback(async () => {
        const nextPined = !pined;
        await appWindow.setAlwaysOnTop(nextPined).catch(() => {});
        setPined(nextPined);
    }, [pined]);

    return [pined, togglePin];
}
