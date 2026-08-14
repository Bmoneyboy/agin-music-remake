import { useTabsHeight } from '@lib/hooks';
import React from 'react';
import MediaLibItem, { TMediaLibItem } from './Item';
import { createContext, useMemo } from 'react';
import { FlatListProps, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LegendList } from '@legendapp/list';

export type MediaLibraryLayout = 'grid' | 'list' | 'gridCompact' | 'horizontal' | '';

export type MediaLibrarySize = 'small' | 'medium' | 'large';

export interface MediaLibraryListProps extends Omit<FlatListProps<TMediaLibItem>, 'renderItem' | 'data'> {
    data: TMediaLibItem[];
    onItemPress: (item: TMediaLibItem) => void;
    onItemLongPress?: (item: TMediaLibItem) => void;
    layout?: MediaLibraryLayout;
    size?: MediaLibrarySize;
    withSeparators?: boolean;
    withTopMargin?: boolean;
    rightSection?: ({ item, index }: { item: TMediaLibItem, index: number }) => React.ReactNode;
    isFullHeight?: boolean;
    ListComponent?: React.ComponentType<any>;
}

export const LibLayout = createContext<MediaLibraryLayout>('list');
export const LibSize = createContext<MediaLibrarySize>('large');
export const LibSeparators = createContext<boolean>(true);

export default function MediaLibraryList({ data, layout = 'list', size = 'large', withSeparators = true, withTopMargin = true, onItemPress, onItemLongPress, rightSection: RightSection, isFullHeight = true, ListComponent, ...props }: MediaLibraryListProps) {
    const [tabsHeight] = useTabsHeight();

    const { width } = useWindowDimensions();

    const ResolvedList = ListComponent || LegendList;
    const isGrid = layout === 'grid' || layout === 'gridCompact';

    const styles = useMemo(() => StyleSheet.create({
        list: {
            flex: 1,
        },
        gridSeparator: {
            height: 10,
        },
        horizontalSeparator: {
            width: 10,
        },
        footer: {
            height: isFullHeight ? (tabsHeight + 10) : 0,
        },
        horizontalPadding: {
            width: 20,
        }
    }), [layout, isFullHeight, tabsHeight]);

    const contentStyle = useMemo(() => ({
        paddingTop: withTopMargin ? (isGrid ? 10 : 5) : 0,
        ...(isGrid ? { paddingHorizontal: 20 } : {}),
    }), [withTopMargin, isGrid]);

    const estimatedItemSize = layout === 'grid' ? 200 : layout === 'gridCompact' ? 150 : 62;

    return (
        <LibLayout.Provider value={layout}>
            <LibSize.Provider value={size}>
                <LibSeparators.Provider value={withSeparators}>
                    <ResolvedList
                        style={styles.list}
                        contentContainerStyle={contentStyle}
                        data={data}
                        keyExtractor={(item: TMediaLibItem) => item.id}
                        renderItem={({ item, index }: { item: TMediaLibItem, index: number }) => <MediaLibItem {...item} onPress={() => onItemPress(item)} onLongPress={() => onItemLongPress?.(item)} style={[layout === 'grid' && { flex: 1 / 2 }, layout === 'gridCompact' && { flex: 1 / 3 }]} index={index} rightSection={RightSection ? <RightSection item={item} index={index} /> : undefined} />}
                        numColumns={layout === 'grid' ? 2 : layout === 'gridCompact' ? 3 : 1}
                        ItemSeparatorComponent={isGrid ? () => <View style={styles.gridSeparator} /> : layout == 'horizontal' ? () => <View style={styles.horizontalSeparator} /> : undefined}
                        ListFooterComponent={<View style={layout === 'horizontal' ? styles.horizontalPadding : styles.footer} />}
                        ListHeaderComponent={layout === 'horizontal' ? <View style={styles.horizontalPadding} /> : undefined}
                        horizontal={layout === 'horizontal'}
                        showsHorizontalScrollIndicator={false}
                        snapToAlignment={layout === 'horizontal' ? 'start' : undefined}
                        snapToInterval={layout === 'horizontal' ? ((width - 40 - 10) / 2) + 10 : undefined}
                        estimatedItemSize={estimatedItemSize}
                        recycleItems
                        key={layout}
                        {...props}
                    />
                </LibSeparators.Provider>
            </LibSize.Provider>
        </LibLayout.Provider>
    )
}