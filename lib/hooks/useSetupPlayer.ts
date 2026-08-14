import { useEffect, useRef } from 'react';
import { TrackPlayer } from 'react-native-nitro-player';

async function setupPlayer() {
    TrackPlayer.configure({
        androidAutoEnabled: false,
        // The README advertises CarPlay now-playing support but this was shipped
        // as false, so the CarPlay scene was never registered. Enabling it needs
        // a build signed with the CarPlay audio entitlement, which Apple grants
        // per-app on request. Without the entitlement the flag is inert rather
        // than fatal, so it is safe to leave on for non-CarPlay builds.
        carPlayEnabled: true,
        showInNotification: true,
        // Resolve stream URLs for upcoming tracks ahead of time. Without this the
        // player only resolves on demand, which is what produces the pause
        // between tracks on slower connections.
        lookaheadCount: 5,
    });
    TrackPlayer.setRepeatMode('off');
}

export type useSetupPlayerProps = {
    onLoad?: () => void;
}

export function useSetupPlayer({ onLoad }: useSetupPlayerProps) {
    const isInitialized = useRef(false);

    useEffect(() => {
        (async () => {
            try {
                await setupPlayer();
                isInitialized.current = true;
                onLoad?.();
            } catch (error) {
                isInitialized.current = false;
            }
        })();
    }, [onLoad]);
}
