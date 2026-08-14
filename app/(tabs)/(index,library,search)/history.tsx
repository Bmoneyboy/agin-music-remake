import Container from '@lib/components/Container';
import Header from '@lib/components/Header';
import FullscreenMessage from '@lib/components/FullscreenMessage';
import MediaLibraryList from '@lib/components/MediaLibraryList';
import { TMediaLibItem } from '@lib/components/MediaLibraryList/Item';
import TagTabs from '@lib/components/TagTabs';
import { TTagTab } from '@lib/components/TagTabs/TagTab';
import Title from '@lib/components/Title';
import { useColors, useCoverBuilder, useHomeItemActions, usePlaybackHistory, useQueue } from '@lib/hooks';
import { AggregateRow, PlaybackHistoryItem } from '@lib/providers/PlaybackHistoryProvider';
import { IconHistory } from '@tabler/icons-react-native';
import { formatDistanceToNow } from 'date-fns';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

type HistoryTab = 'recent' | 'tracks' | 'albums' | 'artists';

const TABS: TTagTab[] = [
    { id: 'recent', label: 'Recent' },
    { id: 'tracks', label: 'Top Songs' },
    { id: 'albums', label: 'Top Albums' },
    { id: 'artists', label: 'Top Artists' },
];

type RangeId = '7' | '30' | '365' | 'all';

const RANGES: TTagTab[] = [
    { id: '7', label: 'Week' },
    { id: '30', label: 'Month' },
    { id: '365', label: 'Year' },
    { id: 'all', label: 'All time' },
];

function sinceFor(range: RangeId) {
    if (range === 'all') return 0;
    return Date.now() - Number(range) * 24 * 60 * 60 * 1000;
}

export default function History() {
    const colors = useColors();
    const cover = useCoverBuilder();
    const queue = useQueue();
    const { press, longPress } = useHomeItemActions();
    const {
        history,
        pendingScrobbles,
        getRecentTracks,
        getTopTracks,
        getTopAlbums,
        getTopArtists,
    } = usePlaybackHistory();

    const [tab, setTab] = useState<HistoryTab>('recent');
    const [range, setRange] = useState<RangeId>('30');
    const [recent, setRecent] = useState<PlaybackHistoryItem[]>([]);
    const [rows, setRows] = useState<AggregateRow[]>([]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (tab === 'recent') {
                const result = await getRecentTracks(300);
                if (!cancelled) setRecent(result);
                return;
            }

            const since = sinceFor(range);
            const fetcher = tab === 'tracks' ? getTopTracks : tab === 'albums' ? getTopAlbums : getTopArtists;
            const result = await fetcher(since, 100);
            if (!cancelled) setRows(result);
        })();

        return () => { cancelled = true; };
    }, [tab, range, history, getRecentTracks, getTopTracks, getTopAlbums, getTopArtists]);

    const items = useMemo<TMediaLibItem[]>(() => {
        if (tab === 'recent') {
            return recent.map((row): TMediaLibItem => ({
                // Rows are historical events, so the same track appears many
                // times. Key on the row, not the track, or the list de-dupes.
                id: `${row.rowId}`,
                title: row.title,
                subtitle: `${row.artist ?? 'Unknown artist'} · ${formatDistanceToNow(row.playedAt, { addSuffix: true })}`,
                coverArt: row.coverArt ?? '',
                coverUri: cover.generateUrl(row.coverArt ?? '', { size: 128 }),
                coverCacheKey: `${row.coverArt}-128x128`,
                type: 'track',
            }));
        }

        const type = tab === 'tracks' ? 'track' : tab === 'albums' ? 'album' : 'artist';

        return rows.map((row): TMediaLibItem => ({
            id: row.id,
            title: row.name,
            subtitle: row.secondaryName
                ? `${row.secondaryName} · ${row.playCount} plays`
                : `${row.playCount} plays`,
            coverArt: row.coverArt ?? '',
            coverUri: cover.generateUrl(row.coverArt ?? '', { size: 128 }),
            coverCacheKey: `${row.coverArt}-128x128`,
            type,
        }));
    }, [tab, recent, rows, cover.generateUrl]);

    // On the Recent tab the item id is a history row id, so the shared handlers
    // would look up the wrong entity. Resolve back to the real track id first.
    const onPress = useCallback((item: TMediaLibItem) => {
        if (tab !== 'recent') return press(item);

        const row = recent.find(r => `${r.rowId}` === item.id);
        if (row) queue.playTrackNow(row.trackId);
    }, [tab, recent, press, queue]);

    const onLongPress = useCallback((item: TMediaLibItem) => {
        if (tab !== 'recent') return longPress(item);

        const row = recent.find(r => `${r.rowId}` === item.id);
        if (row) longPress({ ...item, id: row.trackId });
    }, [tab, recent, longPress]);

    const styles = useMemo(() => StyleSheet.create({
        pending: {
            paddingHorizontal: 20,
            paddingTop: 8,
        },
    }), []);

    return (
        <Container>
            <Header title="Listening History" withBackIcon />
            <TagTabs data={TABS} tab={tab} onChange={(t) => setTab(t as HistoryTab)} />
            {tab !== 'recent' && (
                <TagTabs data={RANGES} tab={range} onChange={(r) => setRange(r as RangeId)} />
            )}

            {pendingScrobbles > 0 && (
                <View style={styles.pending}>
                    <Title size={12} fontFamily="Poppins-Regular" color={colors.text[1]}>
                        {pendingScrobbles} {pendingScrobbles === 1 ? 'play' : 'plays'} waiting to sync to your server
                    </Title>
                </View>
            )}

            {items.length === 0 ? (
                <FullscreenMessage
                    icon={IconHistory}
                    label="Nothing here yet"
                    description="Play some music and it will show up here."
                />
            ) : (
                <MediaLibraryList
                    data={items}
                    layout="list"
                    size="medium"
                    onItemPress={onPress}
                    onItemLongPress={onLongPress}
                />
            )}
        </Container>
    );
}
