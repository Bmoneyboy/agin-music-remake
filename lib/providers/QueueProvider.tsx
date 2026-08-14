import { Child } from '@lib/types';
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCache } from '@lib/hooks/useCache';
import { useApi, useApiHelpers, useCoverBuilder, useServer, useSubsonicParams, useSetting } from '@lib/hooks';
import qs from 'qs';
import { SheetManager } from 'react-native-actions-sheet';
import * as Haptics from 'expo-haptics';
import { TrackPlayer, PlayerQueue, useOnPlaybackProgressChange, useOnChangeTrack, TrackItem } from 'react-native-nitro-player';
import showToast from '@lib/showToast';
import { IconExclamationCircle } from '@tabler/icons-react-native';
import { shuffleArray } from '@lib/util';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type RepeatModeValue = 'off' | 'Playlist' | 'track';

export type ClearConfirmOptions = {
    wait?: boolean;
    onConfirm?: () => void;
}

export type QueueReplaceOptions = {
    initialIndex?: number;
    source?: QueueSource;
    shuffle?: boolean;
}

export type TQueueItem = TrackItem & { _child: Child };

export type QueueSource = {
    source: 'playlist' | 'album' | 'artist' | 'none';
    sourceId?: string;
    sourceName?: string;
}

const initialSource: QueueSource = {
    source: 'none',
}

export type QueueContextType = {
    queue: TQueueItem[];
    source: QueueSource;
    nowPlaying: Child;
    activeIndex: number;
    canGoForward: boolean;
    canGoBackward: boolean;
    setQueue: (queue: TQueueItem[]) => void;
    add: (id: string) => Promise<boolean>;
    clear: () => void;
    clearConfirm: (options?: ClearConfirmOptions) => Promise<boolean>;
    jumpTo: (index: number) => void;
    skipBackward: () => void;
    skipForward: () => void;
    replace: (items: Child[], options?: QueueReplaceOptions) => void;
    playTrackNow: (id: string) => Promise<boolean>;
    playNext: (id: string) => Promise<boolean>;
    repeatMode: RepeatModeValue;
    changeRepeatMode: (mode: RepeatModeValue) => Promise<void>;
    cycleRepeatMode: () => Promise<void>;
    toggleStar: () => Promise<void>;
    reorder: (from: number, to: number) => void;
}

const initialQueueContext: QueueContextType = {
    queue: [],
    source: initialSource,
    nowPlaying: {
        id: '',
        isDir: false,
        title: '',
    },
    activeIndex: 0,
    canGoBackward: false,
    canGoForward: false,
    setQueue: () => { },
    add: async (id: string) => false,
    clear: () => { },
    clearConfirm: async () => false,
    jumpTo: (index: number) => { },
    skipBackward: () => { },
    skipForward: () => { },
    replace: (items: Child[]) => { },
    playTrackNow: async (id: string) => false,
    playNext: async (id: string) => false,
    repeatMode: 'off',
    changeRepeatMode: async () => { },
    cycleRepeatMode: async () => { },
    toggleStar: async () => { },
    reorder: () => { },
}

export const QueueContext = createContext<QueueContextType>(initialQueueContext);

export type StreamOptions = {
    id: string;
    maxBitRate?: string;
    format?: string;
    timeOffset?: string;
    estimateContentLength?: boolean;
}

export default function QueueProvider({ children }: { children?: React.ReactNode }) {
    const [queue, setQueue] = useState<TQueueItem[]>([]);
    const [nowPlaying, setNowPlaying] = useState<Child>(initialQueueContext.nowPlaying);
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [source, setSource] = useState<QueueSource>(initialSource);
    const [repeatMode, setRepeatMode] = useState<RepeatModeValue>('off');
    const playlistIdRef = useRef<string>('agin-queue');
    const trackChildMapRef = useRef<Map<string, Child>>(new Map());

    const canGoBackward = nowPlaying.id != '';
    const canGoForward = activeIndex < (queue.length ?? 0) - 1;

    const cache = useCache();
    const api = useApi();
    const params = useSubsonicParams();
    const { server } = useServer();
    const cover = useCoverBuilder();
    const helpers = useApiHelpers();
    const maxBitRate = useSetting('streaming.maxBitRate') as string | undefined;
    const streamingFormat = useSetting('streaming.format') as string | undefined;
    const persistQueue = useSetting('app.persistQueue') as boolean | undefined;

    // The progress subscription deliberately lives in <ProgressWatcher /> below
    // rather than here. Subscribing in the provider body re-rendered
    // QueueProvider on every progress tick, which recreated the context value
    // and re-rendered every useQueue() consumer in the app several times a
    // second for the entire duration of playback.
    const progressRef = useRef<number>(0);

    // Scrobbling lives in PlaybackHistoryProvider, which only submits a play
    // once a listen threshold is met. Do not re-add a scrobble call here: this
    // effect used to fire on every nowPlaying change, which meant skipping a
    // track, starring a track, or restoring the queue at launch all counted as
    // full plays.

    const generateMediaUrl = useCallback((options: StreamOptions) => {
        const streamParams: StreamOptions = { ...options };
        if (maxBitRate && maxBitRate !== '0') {
            streamParams.maxBitRate = maxBitRate;
        }
        if (streamingFormat && streamingFormat !== 'raw') {
            streamParams.format = streamingFormat;
        }
        return `${server.url}/rest/stream?${qs.stringify({ ...params, ...streamParams })}`;
    }, [params, server.url, maxBitRate, streamingFormat]);

    const convertToTrackItem = useCallback((data: Child): TQueueItem => {
        const uniqueId = `${data.id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        return {
            id: uniqueId,
            title: data.title ?? '',
            artist: data.artist ?? '',
            album: data.album ?? '',
            duration: data.duration ?? 0,
            url: generateMediaUrl({ id: data.id }),
            artwork: cover.generateUrl(data.coverArt || data.id),
            extraPayload: { _child: data } as any,
            _child: data,
        };
    }, [generateMediaUrl, cover.generateUrl]);

    const loadTracks = useCallback((tracks: TQueueItem[]) => {
        try { PlayerQueue.deletePlaylist(playlistIdRef.current); } catch (e) {}
        const newId = PlayerQueue.createPlaylist('agin-queue');
        playlistIdRef.current = newId;
        if (tracks.length > 0) {
            PlayerQueue.addTracksToPlaylist(newId, tracks);
        }
        PlayerQueue.loadPlaylist(newId);
        tracks.forEach(t => trackChildMapRef.current.set(t.id, t._child));
    }, []);

    const updateNowPlaying = useCallback(async () => {
        try {
            const state = await TrackPlayer.getState();
            const currentQueue = await TrackPlayer.getActualQueue();
            if (!currentQueue || currentQueue.length === 0) return;

            const currentIndex = state?.currentIndex ?? 0;
            const track = currentQueue[currentIndex];
            if (!track) return;

            const child = trackChildMapRef.current.get(track.id);
            if (child) {
                setNowPlaying(child);
            } else {
                setNowPlaying({
                    id: track.id,
                    isDir: false,
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    duration: track.duration,
                });
            }
        } catch (e) {
            // Error updating now playing
        }
    }, []);

    const updateQueue = useCallback(async () => {
        try {
            const currentQueue = await TrackPlayer.getActualQueue();
            const enrichedQueue = (currentQueue ?? []).map(track => ({
                ...track,
                _child: trackChildMapRef.current.get(track.id) ?? {
                    id: track.id,
                    isDir: false,
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    duration: track.duration,
                },
            })) as TQueueItem[];
            setQueue(enrichedQueue);
        } catch (e) {
            // Error updating queue
        }
    }, []);

    const updateActive = useCallback(async () => {
        try {
            const state = await TrackPlayer.getState();
            const currentIndex = state?.currentIndex ?? 0;
            setActiveIndex(currentIndex);
        } catch (e) {
            // Error updating active index
        }
    }, []);

    useEffect(() => {
        updateNowPlaying();
        updateQueue();
        updateActive();
    }, []);

    useEffect(() => {
        if (persistQueue) {
            const stateToSave = {
                queue: queue.map(q => q._child),
                activeIndex,
                source,
                repeatMode,
            };
            AsyncStorage.setItem('@agin:queue_state', JSON.stringify(stateToSave)).catch(console.error);
        } else if (persistQueue === false) {
            AsyncStorage.removeItem('@agin:queue_state').catch(console.error);
        }
    }, [queue, activeIndex, source, repeatMode, persistQueue]);

    useEffect(() => {
        const restoreQueue = async () => {
            try {
                const persistSetting = await AsyncStorage.getItem('settings.app.persistQueue');
                if (persistSetting !== 'true') return;

                const savedStateStr = await AsyncStorage.getItem('@agin:queue_state');
                if (savedStateStr) {
                    const savedState = JSON.parse(savedStateStr);
                    if (savedState.queue && savedState.queue.length > 0) {
                        const tracks = savedState.queue.map(convertToTrackItem);
                        loadTracks(tracks);
                        if (savedState.activeIndex !== undefined) {
                            await TrackPlayer.skipToIndex(savedState.activeIndex);
                        }
                        if (savedState.source) {
                            setSource(savedState.source);
                        }
                        if (savedState.repeatMode) {
                            setRepeatMode(savedState.repeatMode);
                            TrackPlayer.setRepeatMode(savedState.repeatMode);
                        }
                        await updateQueue();
                        await updateActive();
                        await updateNowPlaying();
                    }
                }
            } catch (e) {
                console.error('Failed to restore queue state', e);
            }
        };

        TrackPlayer.getActualQueue().then(currentQueue => {
            if (!currentQueue || currentQueue.length === 0) {
                restoreQueue();
            }
        });
    }, []);

    const { track: changedTrack } = useOnChangeTrack();

    useEffect(() => {
        if (changedTrack) {
            updateNowPlaying();
            updateActive();
        }
    }, [changedTrack, updateNowPlaying, updateActive]);

    const modifyQueue = useCallback(async (tracks: TQueueItem[]): Promise<void> => {
        try {
            const currentQueue = await TrackPlayer.getActualQueue();
            const state = await TrackPlayer.getState();
            const currentlyPlaying = state?.currentIndex ?? null;

            if (currentlyPlaying === null || !currentQueue || currentQueue.length === 0) {
                loadTracks(tracks);
                await updateQueue();
                await updateActive();
                return;
            }

            const currentlyPlayingMetadata = currentQueue[currentlyPlaying];
            const newCurrentIndex = tracks.findIndex(track => track.id === currentlyPlayingMetadata?.id);

            loadTracks(tracks);
            if (newCurrentIndex >= 0) {
                await TrackPlayer.skipToIndex(newCurrentIndex);
            }

            await updateQueue();
            await updateActive();
        } catch (e) {
            // Error modifying queue
        }
    }, [loadTracks]);

    const reorder = useCallback(async (from: number, to: number) => {
        try {
            const track = queue[from];
            if (!track) return;

            PlayerQueue.reorderTrackInPlaylist(playlistIdRef.current, track.id, to);
            
            setQueue(prevQueue => {
                const newQueue = [...prevQueue];
                const [removed] = newQueue.splice(from, 1);
                newQueue.splice(to, 0, removed);
                return newQueue;
            });

            setActiveIndex(prevIndex => {
                if (from === prevIndex) return to;
                if (from < prevIndex && to >= prevIndex) return prevIndex - 1;
                if (from > prevIndex && to <= prevIndex) return prevIndex + 1;
                return prevIndex;
            });
        } catch (e) {
            // Error reordering queue
        }
    }, [queue]);

    const add = useCallback(async (id: string) => {
        const data = await cache.fetchChild(id);
        if (!data) return false;

        const trackItem = convertToTrackItem(data);
        trackChildMapRef.current.set(trackItem.id, data);
        const currentQueue = await TrackPlayer.getActualQueue();

        if (!currentQueue || currentQueue.length === 0) {
            loadTracks([trackItem]);
            TrackPlayer.play();
            setNowPlaying(data);
        } else {
            PlayerQueue.addTrackToPlaylist(playlistIdRef.current, trackItem);
        }

        await updateQueue();
        await updateActive();
        return true;
    }, [cache, convertToTrackItem, loadTracks]);

    const playNext = useCallback(async (id: string) => {
        const data = await cache.fetchChild(id);
        if (!data) return false;

        const trackItem = convertToTrackItem(data);
        trackChildMapRef.current.set(trackItem.id, data);
        PlayerQueue.addTrackToPlaylist(playlistIdRef.current, trackItem);
        await TrackPlayer.playNext(trackItem.id);

        await updateQueue();
        await updateActive();
        return true;
    }, [cache, convertToTrackItem]);

    const playTrackNow = useCallback(async (id: string) => {
        const data = await cache.fetchChild(id);
        if (!data) {
            await showToast({
                title: 'Track Not Found',
                subtitle: 'The track you\'re trying to play does not exist on this server.',
                icon: IconExclamationCircle,
                haptics: 'error',
            });
            return false;
        }

        const trackItem = convertToTrackItem(data);
        loadTracks([trackItem]);
        TrackPlayer.play();

        setNowPlaying(data);
        await updateQueue();
        await updateActive();
        return true;
    }, [cache, convertToTrackItem, loadTracks]);

    const replace = useCallback(async (items: Child[], options?: QueueReplaceOptions) => {
        let itemsCopy = [...items];
        if (options?.shuffle) itemsCopy = shuffleArray(itemsCopy);
        if (options?.source) setSource(options.source);

        const tracks = itemsCopy.map(convertToTrackItem);
        loadTracks(tracks);

        const initialIndex = options?.initialIndex ?? 0;
        if (initialIndex > 0) {
            await TrackPlayer.skipToIndex(initialIndex);
        }
        TrackPlayer.play();

        setNowPlaying(itemsCopy[initialIndex]);
        await updateQueue();
        await updateActive();
    }, [convertToTrackItem, loadTracks]);

    const clear = useCallback(async () => {
        TrackPlayer.pause();
        loadTracks([]);

        setQueue([]);
        setNowPlaying(initialQueueContext.nowPlaying);
        trackChildMapRef.current.clear();
    }, [loadTracks]);

    const clearConfirm = useCallback(async (options?: ClearConfirmOptions) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        const confirmed = await SheetManager.show('confirm', {
            payload: {
                title: 'Clear Queue',
                message: 'Are you sure you want to clear the queue?',
                confirmText: 'Clear',
                cancelText: 'Cancel',
            },
        });
        if (!confirmed) return false;

        if (options?.wait) {
            TrackPlayer.pause();
            if (options?.onConfirm) options.onConfirm();
            await new Promise(r => setTimeout(r, 500));
        }

        clear();
        return true;
    }, [clear]);

    const jumpTo = useCallback(async (index: number) => {
        await TrackPlayer.skipToIndex(index);
        await updateActive();
        await updateNowPlaying();
    }, [updateActive, updateNowPlaying]);

    const skipForward = useCallback(async () => {
        await TrackPlayer.skipToNext();
        await updateActive();
        await updateNowPlaying();
    }, [updateActive, updateNowPlaying]);

    const skipBackward = useCallback(async () => {
        const position = progressRef.current;

        if (position > 5) {
            await TrackPlayer.seek(0);
        } else {
            await TrackPlayer.skipToPrevious();
            await updateActive();
            await updateNowPlaying();
        }
    }, [updateActive, updateNowPlaying]);

    const changeRepeatMode = useCallback(async (mode: RepeatModeValue) => {
        setRepeatMode(mode);
        TrackPlayer.setRepeatMode(mode);
    }, []);

    const cycleRepeatMode = useCallback(async () => {
        if (repeatMode === 'off') {
            await changeRepeatMode('Playlist');
        } else if (repeatMode === 'Playlist') {
            await changeRepeatMode('track');
        } else {
            await changeRepeatMode('off');
        }
    }, [repeatMode]);

    const setStarred = useCallback(async (set: boolean) => {
        const starred = set ? new Date() : undefined;
        setNowPlaying(nowPlaying => ({ ...nowPlaying, starred }));
        setQueue(q => q.map(x => x.id === nowPlaying.id ? ({ ...x, starred }) : x));
    }, [queue, nowPlaying, cache]);

    const toggleStar = useCallback(async () => {
        if (!nowPlaying.id) return;

        await setStarred(!nowPlaying.starred);

        try {
            await helpers.star(nowPlaying.id, 'track', nowPlaying.starred ? 'unstar' : 'star');
        } catch (error) {
            await showToast({
                haptics: 'error',
                icon: IconExclamationCircle,
                title: 'Error',
                subtitle: 'An error occurred while liking the track.',
            });
            return;
        }

        await cache.fetchChild(nowPlaying.id, true);
    }, [queue, nowPlaying, cache]);

    const value = useMemo<QueueContextType>(() => ({
        queue,
        nowPlaying,
        canGoBackward,
        canGoForward,
        activeIndex,
        add,
        clear,
        setQueue: modifyQueue,
        jumpTo,
        skipBackward,
        skipForward,
        replace,
        clearConfirm,
        source,
        playTrackNow,
        playNext,
        repeatMode,
        changeRepeatMode,
        cycleRepeatMode,
        toggleStar,
        reorder,
    }), [
        queue, nowPlaying, canGoBackward, canGoForward, activeIndex, add, clear,
        modifyQueue, jumpTo, skipBackward, skipForward, replace, clearConfirm,
        source, playTrackNow, playNext, repeatMode, changeRepeatMode,
        cycleRepeatMode, toggleStar, reorder,
    ]);

    return (
        <QueueContext.Provider value={value}>
            <ProgressWatcher positionRef={progressRef} />
            {children}
        </QueueContext.Provider>
    )
}

/**
 * Renders nothing. Mirrors the player position into a ref so that the
 * high-frequency progress subscription re-renders a leaf node instead of the
 * whole provider and every one of its consumers.
 */
function ProgressWatcher({ positionRef }: { positionRef: React.RefObject<number> }) {
    const { position } = useOnPlaybackProgressChange();

    useEffect(() => {
        positionRef.current = position ?? 0;
    }, [position, positionRef]);

    return null;
}
