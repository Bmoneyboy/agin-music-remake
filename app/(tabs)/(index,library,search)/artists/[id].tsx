import Container from '@/lib/components/Container';
import Header from '@/lib/components/Header';
import { useApi, useColors, useCoverBuilder, useDownloads, useQueue, useTabsHeight } from '@lib/hooks';
import ActionIcon from '@/lib/components/ActionIcon';
import { LibSize, LibLayout, LibSeparators } from '@/lib/components/MediaLibraryList';
import MediaLibItem from '@/lib/components/MediaLibraryList/Item';
import { IconArrowsShuffle, IconDots, IconDownload, IconPlayerPlayFilled } from '@tabler/icons-react-native';
import { SheetManager } from 'react-native-actions-sheet';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedRef, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ArtistWithAlbumsID3, AlbumID3 } from '@lib/types';
import Cover from '@/lib/components/Cover';
import Title from '@/lib/components/Title';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaylistBackground } from '@/lib/components/Playlist/PlaylistBackground';

export default function Artist() {
    const { id } = useLocalSearchParams();

    const api = useApi();
    const cover = useCoverBuilder();
    const queue = useQueue();
    const downloads = useDownloads();
    const colors = useColors();
    const [tabsHeight] = useTabsHeight();
    const listRef = useAnimatedRef<any>();
    const insets = useSafeAreaInsets();

    const [data, setData] = useState<ArtistWithAlbumsID3 | null>(null);

    const containerOpacity = useSharedValue(0);

    const containerStyle = useAnimatedStyle(() => ({
        opacity: containerOpacity.value,
    }));

    useEffect(() => {
        if (!data) return;
        containerOpacity.value = withTiming(1, { duration: 200, easing: Easing.inOut(Easing.ease) });
    }, [data]);

    const refreshArtist = useCallback(async () => {
        if (!api) return;
        const res = await api.get('/getArtist', { params: { id } });
        const artist = res.data?.['subsonic-response']?.artist as ArtistWithAlbumsID3;
        if (artist) setData(artist);
    }, [api, id]);

    useFocusEffect(useCallback(() => {
        refreshArtist();
    }, [refreshArtist]));

    const showMenu = useCallback(() => {
        if (!data) return;
        Haptics.selectionAsync();
        SheetManager.show('artist', {
            payload: {
                id: data.id,
                data,
                context: 'artist',
            }
        });
    }, [data]);

    const fetchAllSongs = useCallback(async () => {
        if (!api || !data?.album?.length) return [];
        const albumPromises = data.album.map(async (album) => {
            const res = await api.get('/getAlbum', { params: { id: album.id } });
            return res.data?.['subsonic-response']?.album?.song ?? [];
        });
        const albumSongs = await Promise.all(albumPromises);
        return albumSongs.flat();
    }, [api, data]);

    const downloadAll = useCallback(async () => {
        const allSongs = await fetchAllSongs();
        if (!allSongs.length || !data) return;
        await downloads.downloadPlaylist(data.id, allSongs);
    }, [fetchAllSongs, data, downloads.downloadPlaylist]);

    const playAction = useCallback(async (shuffle: boolean) => {
        if (!api || !data?.album?.length) return;

        const albumPromises = data.album.map(async (album) => {
            const res = await api.get('/getAlbum', { params: { id: album.id } });
            return res.data?.['subsonic-response']?.album?.song ?? [];
        });

        const albumSongs = await Promise.all(albumPromises);
        const allSongs = albumSongs.flat();

        if (!allSongs.length) return;

        queue.replace(allSongs, {
            initialIndex: 0,
            source: {
                source: 'artist',
                sourceId: data.id,
                sourceName: data.name,
            },
            shuffle,
        });
    }, [api, data, queue.replace]);

    const styles = useMemo(() => StyleSheet.create({
        header: {
            alignItems: 'center',
            paddingTop: 50 + insets.top,
            paddingBottom: 20,
        },
        title: {
            marginTop: 16,
            marginHorizontal: 20,
            alignItems: 'center',
        },
        actions: {
            flexDirection: 'row',
            marginTop: 16,
            gap: 16,
            alignItems: 'center',
        },
        albumCount: {
            marginTop: 4,
        }
    }), [colors, insets]);

    const renderItem = useCallback(({ item, index }: { item: AlbumID3, index: number }) => (
        <MediaLibItem
            id={item.id}
            title={item.name}
            subtitle={`${item.songCount} ${item.songCount === 1 ? 'song' : 'songs'} • ${item.year ?? 'Unknown year'}`}
            coverUri={cover.generateUrl(item.coverArt ?? '', { size: 128 })}
            coverCacheKey={`${item.coverArt}-128x128`}
            type="album"
            onPress={() => {
                router.push({ pathname: '/albums/[id]', params: { id: item.id } });
            }}
        />
    ), [cover]);

    const ListHeader = useMemo(() => {
        if (!data) return null;

        return (
            <View style={styles.header}>
                <PlaylistBackground
                    source={{ uri: cover.generateUrl(data.coverArt ?? '') }}
                    cacheKey={`${data.coverArt}-full`}
                />
                <Cover
                    source={{ uri: cover.generateUrl(data.coverArt ?? '') }}
                    cacheKey={`${data.coverArt}-full`}
                    size={200}
                    radius={100}
                />
                <View style={styles.title}>
                    <Title align="center" size={24} fontFamily="Poppins-SemiBold">{data.name}</Title>
                    <View style={styles.albumCount}>
                        <Title align="center" size={14} fontFamily="Poppins-Regular" color={colors.text[1]}>
                            {data.albumCount} {data.albumCount === 1 ? 'album' : 'albums'}
                        </Title>
                    </View>
                </View>
                <View style={styles.actions}>
                    <ActionIcon icon={IconPlayerPlayFilled} variant='primary' isFilled size={24} extraSize={32} onPress={() => playAction(false)} />
                    <ActionIcon icon={IconArrowsShuffle} variant='subtleFilled' size={20} extraSize={24} onPress={() => playAction(true)} />
                    <ActionIcon icon={IconDownload} variant='subtleFilled' size={20} extraSize={24} onPress={downloadAll} />
                </View>
            </View>
        );
    }, [data, cover, colors, styles, playAction, downloadAll]);

    return (
        <Container includeTop={false} includeBottom={false}>
            <Header
                withBackIcon
                withAvatar={false}
                floating
                scrollRef={listRef}
                interpolationRange={[200, 350]}
                title={data?.name}
                titleSize={18}
                initialHideTitle
                rightSection={<>
                    <ActionIcon icon={IconDots} size={16} variant='secondary' onPress={showMenu} />
                </>} />
            <Animated.View style={[{ flex: 1 }, containerStyle]}>
                <LibLayout.Provider value="list">
                    <LibSize.Provider value="medium">
                        <LibSeparators.Provider value={false}>
                            <AnimatedLegendList
                                data={data?.album ?? []}
                                keyExtractor={(item) => item.id}
                                refScrollView={listRef}
                                renderItem={renderItem}
                                ListHeaderComponent={ListHeader}
                                ListFooterComponent={<View style={{ height: tabsHeight + 10 }} />}
                                estimatedItemSize={62}
                                recycleItems
                            />
                        </LibSeparators.Provider>
                    </LibSize.Provider>
                </LibLayout.Provider>
            </Animated.View>
        </Container>
    )
}

import { router } from 'expo-router';
