import { useColors, useCoverBuilder, useQueue } from '@lib/hooks';
import { Child } from '@lib/types';
import { useContext, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { RenderItemParams } from 'react-native-draggable-flatlist';
import Cover from '../Cover';
import Title from '../Title';
import { IconMenu } from '@tabler/icons-react-native';
import * as Haptics from 'expo-haptics';
import { GestureEnabledContext } from '@/lib/sheets/playback';
import React from 'react';

function QueueItem({ item, getIndex, drag, isActive }: RenderItemParams<Child>) {
    const colors = useColors();
    const cover = useCoverBuilder();

    const queue = useQueue();
    const { nowPlaying } = queue;

    const isPlaying = queue.activeIndex === getIndex();

    const [gestureEnabled, setGestureEnabled] = useContext(GestureEnabledContext);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            backgroundColor: withTiming(
                isActive ? 'rgba(255,255,255,0.2)' : isPlaying ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0)',
                { duration: 250 }
            )
        };
    }, [isActive, isPlaying]);

    const styles = useMemo(() => StyleSheet.create({
        item: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 3,
            paddingHorizontal: 30,
            overflow: 'hidden',
            gap: 5,
        },
        activeItem: {
        },
        left: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            flex: 1,
        },
        metadata: {
            flex: 1,
            overflow: 'hidden',
        }
    }), [isPlaying, isActive]);

    return (
        <TouchableOpacity activeOpacity={.6} onPress={() => queue.jumpTo(getIndex() ?? -1)} onLongPress={async () => {
            setGestureEnabled(false);
            drag();
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        }}>
            <Animated.View style={[styles.item, animatedStyle, isActive && styles.activeItem]}>
                <View style={styles.left}>
                    <Cover
                        source={{ uri: cover.generateUrl(item.coverArt ?? '', { size: 128 }) }}
                        cacheKey={item.coverArt ? `${item.coverArt}-128x128` : 'empty-128x128'}
                        size={50}
                        radius={6}
                        withShadow={false}
                    />
                    <View style={styles.metadata}>
                        <Title size={14} numberOfLines={1}>{item.title}</Title>
                        <Title size={12} fontFamily="Poppins-Regular" color={colors.text[1]} numberOfLines={1}>{item.artist}</Title>
                    </View>
                </View>
                <IconMenu size={20} color={colors.text[1]} />
            </Animated.View>
        </TouchableOpacity>
    )
}

export default React.memo(QueueItem);