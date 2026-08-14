import { useColors, useCoverBuilder, useHomeItemActions, usePlaybackHistory } from '@lib/hooks';
import HomeSectionHeader from '../HomeSectionHeader';
import React, { useEffect, useMemo, useState } from 'react';
import { TMediaLibItem } from '../MediaLibraryList/Item';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Cover from '../Cover';
import Title from '../Title';
import { AggregateRow } from '@lib/providers/PlaybackHistoryProvider';

const ITEM_SIZE = 110;
const ITEM_COUNT = 12;

/** Only rank recent listening so the row reflects current taste, not all time. */
const WINDOW_DAYS = 90;

export type TopSectionProps = {
    label: string;
    /** Entity kind, which also decides whether covers are round. */
    type: 'artist' | 'album';
    fetch: (sinceMs?: number, limit?: number) => Promise<AggregateRow[]>;
    /**
     * Rows required before the section renders. A ranking built from three
     * plays is noise, so hide it until the data means something.
     */
    minItems?: number;
};

/**
 * Horizontal "most played" row backed by local playback history. Shared by the
 * Top Artists and Top Albums sections.
 */
export default function TopSection({ label, type, fetch, minItems = 4 }: TopSectionProps) {
    const cover = useCoverBuilder();
    const colors = useColors();
    const { press, longPress } = useHomeItemActions();
    const { history } = usePlaybackHistory();
    const [rows, setRows] = useState<AggregateRow[]>([]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const since = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
            const result = await fetch(since, ITEM_COUNT);
            if (!cancelled) setRows(result);
        })();

        return () => { cancelled = true; };
    }, [fetch, history]);

    const items = useMemo(() => rows.map((row): TMediaLibItem => ({
        id: row.id,
        title: row.name,
        subtitle: `${row.playCount} ${row.playCount === 1 ? 'play' : 'plays'}`,
        coverArt: row.coverArt ?? '',
        coverUri: cover.generateUrl(row.coverArt ?? '', { size: 256 }),
        coverCacheKey: `${row.coverArt}-256x256`,
        type,
    })), [rows, cover.generateUrl, type]);

    const styles = useMemo(() => StyleSheet.create({
        scroll: {
            paddingHorizontal: 20,
            gap: 12,
        },
        item: {
            width: ITEM_SIZE,
        },
        label: {
            marginTop: 6,
        },
    }), []);

    if (items.length < minItems) return null;

    return (
        <View style={{ marginBottom: 10 }}>
            <HomeSectionHeader label={label} />
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
            >
                {items.map(item => (
                    <Pressable
                        key={item.id}
                        style={styles.item}
                        onPress={() => press(item)}
                        onLongPress={() => longPress(item)}
                    >
                        <Cover
                            source={{ uri: item.coverUri }}
                            cacheKey={item.coverCacheKey}
                            size={ITEM_SIZE}
                            radius={type === 'artist' ? ITEM_SIZE / 2 : 10}
                        />
                        <View style={styles.label}>
                            <Title size={13} numberOfLines={1}>{item.title}</Title>
                            <Title
                                size={11}
                                fontFamily="Poppins-Regular"
                                color={colors.text[1]}
                                numberOfLines={1}
                            >
                                {item.subtitle}
                            </Title>
                        </View>
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    );
}
