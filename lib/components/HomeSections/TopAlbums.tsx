import { usePlaybackHistory } from '@lib/hooks';
import React from 'react';
import TopSection from './TopSection';

export function TopAlbums() {
    const { getTopAlbums } = usePlaybackHistory();

    return <TopSection label="On Repeat" type="album" fetch={getTopAlbums} />;
}
