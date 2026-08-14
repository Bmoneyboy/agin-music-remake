import React, { useContext, useEffect, useMemo } from 'react';
import MediaLibraryList, { LibLayout } from '@lib/components/MediaLibraryList';
import { TMediaLibItem } from '@lib/components/MediaLibraryList/Item';
import { useCoverBuilder, useHomeItemActions, useMemoryCache } from '@/lib/hooks';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

export function ArtistsTab() {
    const cache = useMemoryCache();
    const cover = useCoverBuilder();
    const { press, longPress } = useHomeItemActions();

    const layout = useContext(LibLayout);

    const data = useMemo((): TMediaLibItem[] => cache.cache.allArtists.map(a => ({
        id: a.id,
        title: a.name,
        subtitle: `${a.albumCount} ${a.albumCount === 1 ? 'album' : 'albums'}`,
        coverUri: cover.generateUrl(a.coverArt ?? '', { size: layout == 'grid' ? 300 : 128 }),
        coverCacheKey: `${a.coverArt}-${layout == 'grid' ? '300x300' : '128x128'}`,
        type: 'artist',
    })), [cache.cache.allArtists, cover]);

    useEffect(() => {
        cache.refreshArtists();
    }, [cache.refreshArtists]);

    useFocusEffect(useCallback(() => {
        cache.refreshArtists();
    }, [cache.refreshArtists]));

    return (
        <MediaLibraryList
            data={data}
            onItemPress={press}
            onItemLongPress={longPress}
            layout={layout}
            extraData={cache.cache.allArtists}
        />
    )
}
