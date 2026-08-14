import { PlaybackHistoryContext } from '@lib/providers/PlaybackHistoryProvider';
import { useContext } from 'react';

export function usePlaybackHistory() {
    return useContext(PlaybackHistoryContext);
}
