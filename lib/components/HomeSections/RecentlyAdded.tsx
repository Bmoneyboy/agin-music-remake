import { useApi, useCoverBuilder, useHomeItemActions } from '@lib/hooks';
import HomeSectionHeader from '../HomeSectionHeader';
import MediaLibraryList from '../MediaLibraryList';
import React, { useEffect, useState } from 'react';
import { TMediaLibItem } from '../MediaLibraryList/Item';
import { Child } from '@lib/types';
import { router } from 'expo-router';

export function RecentlyAdded() {
    const cover = useCoverBuilder();
    const api = useApi();
    const { press, longPress } = useHomeItemActions();
    const [data, setData] = useState<TMediaLibItem[]>([]);

    useEffect(() => {
        (async () => {
            if (!api) return;

            try {
                const res = await api.get('/getAlbumList2', {
                    params: {
                        type: 'newest',
                        size: 15,
                    }
                });

                const albums = res.data?.['subsonic-response']?.albumList2?.album as any[];
                if (!albums) return;

                const items = albums.map((album): TMediaLibItem => ({
                    id: album.id,
                    title: album.name || album.title,
                    subtitle: album.artist,
                    coverArt: album.coverArt,
                    coverUri: cover.generateUrl(album.coverArt ?? '', { size: 512 }),
                    coverCacheKey: `${album.coverArt}-300x300`,
                    type: 'album',
                }));

                setData(items);
            } catch (e) {
                console.error('Failed to fetch recently added', e);
            }
        })();
    }, [api, cover.generateUrl]);

    if (data.length === 0) return null;

    return (
        <>
            <HomeSectionHeader label="Recently Added" />
            <MediaLibraryList
                data={data}
                onItemPress={press}
                onItemLongPress={longPress}
                layout='horizontal'
                withTopMargin={false}
                isFullHeight={false}
                snapToAlignment='start'
            />
        </>
    )
}