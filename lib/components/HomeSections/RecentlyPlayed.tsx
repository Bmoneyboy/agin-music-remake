import { useApi, useColors, useCoverBuilder, useHomeItemActions, usePlaybackHistory } from '@lib/hooks';
import HomeSectionHeader from '../HomeSectionHeader';
import React, { useEffect, useState } from 'react';
import { TMediaLibItem } from '../MediaLibraryList/Item';
import Carousel from 'react-native-reanimated-carousel';
import { Dimensions, Pressable, View } from 'react-native';
import Cover from '../Cover';
import Title from '../Title';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const ITEM_COUNT = 10;

/**
 * Minimum number of distinct albums in local history before we stop asking the
 * server. Below this the carousel would look empty on a fresh install.
 */
const MIN_LOCAL_ITEMS = 3;

export function RecentlyPlayed() {
    const cover = useCoverBuilder();
    const api = useApi();
    const colors = useColors();
    const { press, longPress } = useHomeItemActions();
    const { history, getRecentTracks } = usePlaybackHistory();
    const [data, setData] = useState<TMediaLibItem[]>([]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            // Local history first: it is track-accurate, reflects what this
            // device actually played, and works with no network.
            const recent = await getRecentTracks(200);

            const seen = new Set<string>();
            const localItems: TMediaLibItem[] = [];

            for (const row of recent) {
                if (!row.albumId || seen.has(row.albumId)) continue;
                seen.add(row.albumId);

                localItems.push({
                    id: row.albumId,
                    title: row.album ?? row.title,
                    subtitle: row.artist ?? '',
                    coverArt: row.coverArt ?? '',
                    coverUri: cover.generateUrl(row.coverArt ?? '', { size: 512 }),
                    coverCacheKey: `${row.coverArt}-512x512`,
                    type: 'album',
                });

                if (localItems.length >= ITEM_COUNT) break;
            }

            if (localItems.length >= MIN_LOCAL_ITEMS || !api) {
                if (!cancelled) setData(localItems);
                return;
            }

            try {
                const res = await api.get('/getAlbumList2', {
                    params: {
                        type: 'recent',
                        size: ITEM_COUNT,
                    }
                });

                const albums = res.data?.['subsonic-response']?.albumList2?.album as any[];
                if (!albums) {
                    if (!cancelled) setData(localItems);
                    return;
                }

                const items = albums.map((album): TMediaLibItem => ({
                    id: album.id,
                    title: album.name || album.title,
                    subtitle: album.artist,
                    coverArt: album.coverArt,
                    coverUri: cover.generateUrl(album.coverArt ?? '', { size: 512 }),
                    coverCacheKey: `${album.coverArt}-512x512`,
                    type: 'album',
                }));

                if (!cancelled) setData(items);
            } catch (e) {
                console.error('Failed to fetch recently played', e);
                if (!cancelled) setData(localItems);
            }
        })();

        return () => { cancelled = true; };
        // `history` is a dependency so the carousel reorders as tracks play.
    }, [api, cover.generateUrl, getRecentTracks, history]);

    if (data.length === 0) return null;

    return (
        <View style={{ marginBottom: 10 }}>
            <HomeSectionHeader label="Recently Played" />
            <Carousel
                loop
                width={width}
                height={width * 0.6}
                autoPlay={true}
                autoPlayInterval={4000}
                data={data}
                scrollAnimationDuration={1000}
                mode="parallax"
                modeConfig={{
                    parallaxScrollingScale: 0.9,
                    parallaxScrollingOffset: 50,
                }}
                renderItem={({ item }) => (
                    <Pressable
                        onPress={() => press(item)}
                        onLongPress={() => longPress(item)}
                        style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}
                    >
                        <Cover
                            source={{ uri: item.coverUri }}
                            cacheKey={item.coverCacheKey}
                            radius={16}
                            withShadow={false}
                        />
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.8)']}
                            style={{
                                position: 'absolute',
                                bottom: -1,
                                left: 0,
                                right: 0,
                                height: '51%',
                                justifyContent: 'flex-end',
                                padding: 20,
                            }}
                        >
                            <Title size={20} color="#fff" numberOfLines={1}>{item.title}</Title>
                            <Title size={14} color="#ccc" fontFamily="Poppins-Regular" numberOfLines={1}>{item.subtitle}</Title>
                        </LinearGradient>
                    </Pressable>
                )}
            />
        </View>
    )
}