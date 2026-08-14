import { useQueue } from '@/lib/hooks';
import { StyleSheet, View } from 'react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import QueueItem from './QueueItem';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { GestureEnabledContext } from '@/lib/sheets/playback';
import { TQueueItem } from '@lib/providers/QueueProvider';
import { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

export default function Queue() {
    const { queue, setQueue, reorder } = useQueue();

    const [delayedQueue, setDelayedQueue] = useState<TQueueItem[]>(queue ?? []);

    const [gestureEnabled, setGestureEnabled] = useContext(GestureEnabledContext);

    const styles = useMemo(() => StyleSheet.create({
        queue: {
            flex: 1,
        },
        list: {
            // flex: 1,
            height: '100%',
        },
    }), []);

    const handleDragEnd = useCallback(({ data, from, to }: { data: TQueueItem[], from: number, to: number }) => {
        setDelayedQueue(data);
        reorder(from, to);
        setGestureEnabled(true);
    }, [reorder, setGestureEnabled]);

    useEffect(() => {
        setDelayedQueue(queue);
    }, [queue]);

    return (
        <View style={styles.queue}>
            {/* <QueueItem drag={() => { }} item={queue.entry[0]} /> */}
            <DraggableFlatList
                style={styles.list}
                data={delayedQueue ?? []}
                windowSize={3}
                keyExtractor={(item) => item.id}
                renderItem={({ item, ...props }) => <QueueItem item={item._child} {...props} />}
                onDragEnd={handleDragEnd}
                itemEnteringAnimation={FadeIn.duration(200)}
                itemExitingAnimation={FadeOut.duration(150)}
            />
        </View>
    )
}