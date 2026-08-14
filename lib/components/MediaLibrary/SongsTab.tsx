import React, { useContext, useEffect, useMemo } from 'react';
import MediaLibraryList, { LibLayout } from '@lib/components/MediaLibraryList';
import { TMediaLibItem } from '@lib/components/MediaLibraryList/Item';
import { useCoverBuilder, useHomeItemActions, useMemoryCache } from '@/lib/hooks';

export function SongsTab() {
    const cache = useMemoryCache();
    const cover = useCoverBuilder();

    const { press, longPress } = useHomeItemActions();

    const layout = useContext(LibLayout);

    const data = useMemo((): TMediaLibItem[] => cache.cache.allSongs.map(s => ({
        id: s.id,
        title: s.title,
        subtitle: s.artist ?? 'Unknown Artist',
        coverUri: cover.generateUrl(s.coverArt ?? '', { size: layout == 'grid' ? 300 : 128 }),
        coverCacheKey: `${s.coverArt}-${layout == 'grid' ? '300x300' : '128x128'}`,
        type: 'track',
    })), [cache.cache.allSongs, cover]);

    useEffect(() => {
        if (cache.cache.allSongs.length === 0) {
            cache.refreshSongs();
        }
    }, [cache.refreshSongs]);

    return (
        <MediaLibraryList
            data={data}
            onItemPress={press}
            onItemLongPress={longPress}
            layout={layout}
            extraData={cache.cache.allSongs}
        />
    )
}
