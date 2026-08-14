import { usePlaybackHistory } from '@lib/hooks';
import React from 'react';
import TopSection from './TopSection';

export function TopArtists() {
    const { getTopArtists } = usePlaybackHistory();

    return <TopSection label="Your Top Artists" type="artist" fetch={getTopArtists} />;
}
