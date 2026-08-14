import { useColors, useCoverBuilder, useDownloads, useQueue } from '@lib/hooks';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Cover from '../Cover';
import { AlbumWithSongsID3, PlaylistWithSongs } from '@lib/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Title from '../Title';
import { formatDistanceToNow } from 'date-fns';
import React from 'react';
import ActionIcon from '../ActionIcon';
import { IconArrowsShuffle, IconDownload, IconPlayerPlayFilled } from '@tabler/icons-react-native';
import { PlaylistBackground } from './PlaylistBackground';

export type PlaylistHeaderProps = {
    playlist?: PlaylistWithSongs;
    album?: AlbumWithSongsID3;
    onTitlePress?: () => void;
};

export function PlaylistHeader({ playlist, album, onTitlePress }: PlaylistHeaderProps) {
    const colors = useColors();
    const cover = useCoverBuilder();
    const queue = useQueue();
    const downloads = useDownloads();

    const insets = useSafeAreaInsets();

    const styles = useMemo(() => StyleSheet.create({
        container: {
            alignItems: 'center',
            paddingTop: 50 + insets.top,
            paddingBottom: 10,
        },
        title: {
            marginTop: 20,
            marginHorizontal: 20,
        },
        actions: {
            flexDirection: 'row',
            marginTop: 15,
            gap: 15,
            alignItems: 'center',
        }
    }), [colors, insets]);

    const art = playlist?.coverArt ?? album?.coverArt ?? '';

    const playAction = useCallback((shuffle: boolean) => {
        const newQueue = playlist?.entry ?? album?.song;
        if (!newQueue) return;
        queue.replace(newQueue, {
            initialIndex: 0,
            source: {
                source: playlist ? 'playlist' : 'album',
                sourceId: playlist ? playlist.id : album?.id,
                sourceName: playlist ? playlist.name : album?.name,
            },
            shuffle,
        });
    }, [playlist, album, queue.replace]);

    return (
        <View style={styles.container}>
            <PlaylistBackground
                source={{ uri: cover.generateUrl(art) }}
                cacheKey={`${art}-full`}
            />
            <Cover
                source={{ uri: cover.generateUrl(art) }}
                cacheKey={`${art}-full`}
                size={250}
            />
            <View style={styles.title}>
                <Pressable onPress={onTitlePress}>
                    <Title align="center" size={24} fontFamily="Poppins-SemiBold">{playlist?.name ?? album?.name}</Title>
                </Pressable>
                <Title align="center" size={14} fontFamily="Poppins-Regular" color={colors.text[1]}>{playlist && `${playlist.songCount} songs • edited ${formatDistanceToNow(new Date(playlist.changed), { addSuffix: true })}`}{album && `${album.artist} • ${album.year}`}</Title>
            </View>
            <View style={styles.actions}>
                <ActionIcon icon={IconDownload} variant='subtleFilled' size={20} extraSize={24} onPress={async () => {
                    const tracks = playlist?.entry ?? album?.song;
                    const id = playlist?.id ?? album?.id;
                    if (!tracks || !id) return;
                    await downloads.downloadPlaylist(id, tracks);
                }} />
                <ActionIcon icon={IconPlayerPlayFilled} variant='primary' isFilled size={24} extraSize={32} onPress={() => playAction(false)} />
                <ActionIcon icon={IconArrowsShuffle} variant='subtleFilled' size={20} extraSize={24} onPress={() => playAction(true)} />
            </View>
        </View>
    )
}