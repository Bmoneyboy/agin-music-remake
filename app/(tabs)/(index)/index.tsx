import Container from '@lib/components/Container';
import Header from '@lib/components/Header';
import { Pinned, Playlists, Random, RecentlyAdded, RecentlyPlayed, TopAlbums, TopArtists } from '@lib/components/HomeSections';
import { useMemoryCache, useQueue, useServer, useTabsHeight } from '@lib/hooks';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

export default function Home() {
    const [tabsHeight] = useTabsHeight();
    const queue = useQueue();

    const memoryCache = useMemoryCache();
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            // The history-backed rows re-read SQLite on their own; this pulls
            // the server-backed ones.
            await Promise.all([
                memoryCache.refreshPlaylists(),
                memoryCache.refreshAlbums(),
                memoryCache.refreshArtists(),
            ]);
        } finally {
            setRefreshing(false);
        }
    }, [memoryCache]);

    const localParams = useLocalSearchParams();
    const playId = useMemo(() => localParams?.playId, [localParams]);
    const server = useServer();
    useEffect(() => {
        (async () => {
            if (server.serverAuth.hash != '' && playId && typeof playId === 'string' && playId !== '') {
                await queue.playTrackNow(playId);
                router.setParams({ playId: '' });
            }
        })();
    }, [playId, server]);

    const styles = useMemo(() => StyleSheet.create({
        main: {
            flex: 1,
        },
        spacer: {
            height: tabsHeight + 10,
        }
    }), [tabsHeight]);

    return (
        <Container>
            <ScrollView
                style={styles.main}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <Header title="Home" withAvatar />
                <Pinned />
                <RecentlyPlayed />
                <TopArtists />
                <RecentlyAdded />
                <TopAlbums />
                <Playlists />
                <Random />
                <View style={styles.spacer}></View>
            </ScrollView>
        </Container>
    )
}