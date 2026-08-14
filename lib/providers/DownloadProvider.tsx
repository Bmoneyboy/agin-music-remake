import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCache, useCoverBuilder, useServer, useSubsonicParams } from '@lib/hooks';
import {
    DownloadManager,
    TrackItem,
    useDownloadActions,
    useDownloadedTracks,
    useDownloadStorage,
    DownloadedTrack,
    DownloadProgress,
    DownloadStorageInfo,
} from 'react-native-nitro-player';
import { Child } from '@lib/types';
import qs from 'qs';
import showToast from '@lib/showToast';
import { IconCircleCheck, IconCircleX, IconDownload, IconWifi } from '@tabler/icons-react-native';
import * as Network from 'expo-network';
import { useSetting } from '@lib/hooks/useSetting';

export type DownloadContextType = {
    downloadTrack: (child: Child, playlistId?: string) => Promise<void>;
    downloadTrackById: (id: string) => Promise<void>;
    downloadPlaylist: (playlistId: string, tracks: Child[]) => Promise<void>;
    deleteTrack: (trackId: string) => Promise<void>;
    deleteAll: () => Promise<void>;
    cancelDownload: (downloadId: string) => Promise<void>;
    pauseDownload: (downloadId: string) => Promise<void>;
    resumeDownload: (downloadId: string) => Promise<void>;
    retryDownload: (downloadId: string) => Promise<void>;

    isTrackDownloaded: (trackId: string) => boolean;
    getTrackProgress: (trackId: string) => DownloadProgress | undefined;
    getDownloadingMeta: (trackId: string) => Child | undefined;

    downloadedTracks: DownloadedTrack[];
    activeDownloads: DownloadProgress[];
    refreshDownloaded: () => void;
    isDownloading: boolean;

    storageInfo: DownloadStorageInfo | null;
    formattedSize: string;
    refreshStorage: () => Promise<void>;

    wifiOnlyBlocked: boolean;
    pendingDownloadCount: number;
}

const initial: DownloadContextType = {
    downloadTrack: async () => { },
    downloadTrackById: async () => { },
    downloadPlaylist: async () => { },
    deleteTrack: async () => { },
    deleteAll: async () => { },
    cancelDownload: async () => { },
    pauseDownload: async () => { },
    resumeDownload: async () => { },
    retryDownload: async () => { },
    isTrackDownloaded: () => false,
    getTrackProgress: () => undefined,
    getDownloadingMeta: () => undefined,
    downloadedTracks: [],
    activeDownloads: [],
    refreshDownloaded: () => { },
    isDownloading: false,
    storageInfo: null,
    formattedSize: '0 B',
    refreshStorage: async () => { },
    wifiOnlyBlocked: false,
    pendingDownloadCount: 0,
};

export const DownloadContext = createContext<DownloadContextType>(initial);

const PROGRESS_FLUSH_MS = 500;

export default function DownloadProvider({ children }: { children?: React.ReactNode }) {
    const { server } = useServer();
    const params = useSubsonicParams();
    const cover = useCoverBuilder();
    const cache = useCache();

    const actions = useDownloadActions();
    const downloaded = useDownloadedTracks();
    const storage = useDownloadStorage();

    const wifiOnlySetting = useSetting('downloads.wifiOnly');
    const maxBitRate = useSetting('downloads.maxBitRate') as string | undefined;
    const streamingFormat = useSetting('downloads.format') as string | undefined;
    const [isOnWifi, setIsOnWifi] = useState(true);
    const [pendingDownloadCount, setPendingDownloadCount] = useState(0);
    const pendingDownloadsRef = useRef<{ child: Child; playlistId?: string }[]>([]);

    const wifiOnly = wifiOnlySetting === true;
    const wifiOnlyBlocked = wifiOnly && !isOnWifi;

    const startPendingRef = useRef<(() => void) | null>(null);
    useEffect(() => {
        // Only poll while the Wi-Fi-only setting is on. Previously this woke up
        // every 5 seconds for the entire lifetime of the app even when the
        // setting was off and the result was never used.
        if (!wifiOnly) {
            setIsOnWifi(true);
            return;
        }

        let mounted = true;
        let wasOnWifi = true;
        const checkNetwork = async () => {
            try {
                const state = await Network.getNetworkStateAsync();
                const nowOnWifi = state.type === Network.NetworkStateType.WIFI;
                if (mounted) {
                    setIsOnWifi(nowOnWifi);
                    if (nowOnWifi && !wasOnWifi && startPendingRef.current) {
                        startPendingRef.current();
                    }
                    wasOnWifi = nowOnWifi;
                }
            } catch { }
        };
        checkNetwork();
        const interval = setInterval(checkNetwork, 5000);
        return () => { mounted = false; clearInterval(interval); };
    }, [wifiOnly]);

    const [downloadingMeta, setDownloadingMeta] = useState<Map<string, Child>>(new Map());
    const [progressMap, setProgressMap] = useState<Map<string, DownloadProgress>>(new Map());

    const initializedRef = useRef(false);
    const metaFetchInFlightRef = useRef<Set<string>>(new Set());
    const metaFetchUnavailableRef = useRef<Set<string>>(new Set());
    const progressBufferRef = useRef<Map<string, DownloadProgress>>(new Map());
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const completingRef = useRef<Set<string>>(new Set());
    const pendingCleanupRef = useRef<Set<string>>(new Set());
    const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const progressMapRef = useRef(progressMap);
    progressMapRef.current = progressMap;

    const flushProgressBuffer = useCallback(() => {
        flushTimerRef.current = null;
        setProgressMap(prev => {
            const buffer = progressBufferRef.current;
            if (buffer.size === 0) return prev;
            const next = new Map(prev);
            buffer.forEach((p, trackId) => {
                if (p.state === 'completed' || p.state === 'cancelled' || p.state === 'failed') {
                    next.delete(trackId);
                } else {
                    next.set(trackId, p);
                }
            });
            buffer.clear();
            return next;
        });
    }, []);

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        DownloadManager.configure({
            maxConcurrentDownloads: 3,
            autoRetry: true,
            maxRetryAttempts: 3,
            downloadArtwork: true,
            backgroundDownloadsEnabled: true,
        });
        DownloadManager.setPlaybackSourcePreference('auto');
        try {
            DownloadManager.syncDownloads();
        } catch {
            return;
        }

        try {
            const active = DownloadManager.getActiveDownloads();
            const initialMap = new Map<string, DownloadProgress>();
            active.forEach(task => {
                const p = task.progress;
                if (p.state === 'pending' || p.state === 'downloading' || p.state === 'paused') {
                    initialMap.set(task.trackId, p);
                }
            });
            if (initialMap.size > 0) {
                setProgressMap(initialMap);
            }
        } catch { }

        DownloadManager.onDownloadProgress((progress) => {
            progressBufferRef.current.set(progress.trackId, progress);
            if (!flushTimerRef.current) {
                flushTimerRef.current = setTimeout(flushProgressBuffer, PROGRESS_FLUSH_MS);
            }
        });

        DownloadManager.onDownloadStateChange((_downloadId, trackId, state, error) => {
            if (state === 'pending') {
                setProgressMap(prev => {
                    if (prev.has(trackId)) return prev;
                    const next = new Map(prev);
                    next.set(trackId, {
                        trackId,
                        downloadId: _downloadId,
                        bytesDownloaded: 0,
                        totalBytes: 0,
                        progress: 0,
                        state: 'pending',
                    });
                    return next;
                });
            }

            if (state === 'downloading') {
                setProgressMap(prev => {
                    const existing = prev.get(trackId);
                    if (existing?.state === 'downloading') return prev;
                    const next = new Map(prev);
                    next.set(trackId, { ...(existing ?? { trackId, downloadId: _downloadId, bytesDownloaded: 0, totalBytes: 0, progress: 0 }), state: 'downloading' });
                    return next;
                });
            }

            if (state === 'paused') {
                progressBufferRef.current.delete(trackId);
                setProgressMap(prev => {
                    const existing = prev.get(trackId);
                    if (!existing || existing.state === 'paused') return prev;
                    const next = new Map(prev);
                    next.set(trackId, { ...existing, state: 'paused' });
                    return next;
                });
            }

            if (state === 'failed' || state === 'cancelled') {
                progressBufferRef.current.delete(trackId);
                setProgressMap(prev => {
                    if (!prev.has(trackId)) return prev;
                    const next = new Map(prev);
                    next.delete(trackId);
                    return next;
                });
                setDownloadingMeta(prev => {
                    if (!prev.has(trackId)) return prev;
                    const next = new Map(prev);
                    next.delete(trackId);
                    return next;
                });
            }

            if (state === 'completed') {
                progressBufferRef.current.delete(trackId);
                if (!completingRef.current.has(trackId)) {
                    completingRef.current.add(trackId);
                    setProgressMap(prev => {
                        const existing = prev.get(trackId);
                        if (!existing) return prev;
                        const next = new Map(prev);
                        next.set(trackId, { ...existing, progress: 1 });
                        return next;
                    });
                    setTimeout(() => {
                        completingRef.current.delete(trackId);
                        pendingCleanupRef.current.add(trackId);
                        if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
                        cleanupTimerRef.current = setTimeout(() => {
                            cleanupTimerRef.current = null;
                            const toClean = new Set(pendingCleanupRef.current);
                            pendingCleanupRef.current.clear();
                            setProgressMap(prev => {
                                const next = new Map(prev);
                                toClean.forEach(id => next.delete(id));
                                return next.size !== prev.size ? next : prev;
                            });
                            setDownloadingMeta(prev => {
                                const next = new Map(prev);
                                toClean.forEach(id => next.delete(id));
                                return next.size !== prev.size ? next : prev;
                            });
                            downloaded.refresh();
                            storage.refresh();
                        }, 100);
                    }, 800);
                }
            }

            if (state === 'failed' && error) {
                showToast({
                    title: 'Download Failed',
                    subtitle: error.message,
                    icon: IconCircleX,
                    haptics: 'error',
                });
            }
        });

        DownloadManager.onDownloadComplete((track) => {
            showToast({
                title: 'Download Complete',
                subtitle: track.originalTrack.title || track.trackId,
                icon: IconCircleCheck,
            });
        });

        return () => {
            if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
            if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
        };
    }, []);

    const convertToTrackItem = useCallback((child: Child): TrackItem => {
        const streamParams: any = { id: child.id, ...params };
        if (maxBitRate && maxBitRate !== '0') {
            streamParams.maxBitRate = maxBitRate;
        }
        if (streamingFormat && streamingFormat !== 'raw') {
            streamParams.format = streamingFormat;
        }
        const streamUrl = `${server.url}/rest/stream?${qs.stringify(streamParams)}`;
        return {
            id: child.id,
            title: child.title ?? '',
            artist: child.artist ?? '',
            album: child.album ?? '',
            duration: child.duration ?? 0,
            url: streamUrl,
            artwork: cover.generateUrl(child.coverArt || child.id),
            extraPayload: { _child: child } as any,
        };
    }, [server.url, params, cover.generateUrl, maxBitRate, streamingFormat]);

    const downloadTrack = useCallback(async (child: Child, playlistId?: string) => {
        if (DownloadManager.isTrackDownloaded(child.id)) {
            showToast({ title: 'Already Downloaded', subtitle: child.title });
            return;
        }
        if (DownloadManager.isDownloading(child.id) || progressMapRef.current.has(child.id)) {
            showToast({ title: 'Already Downloading', subtitle: child.title });
            return;
        }

        if (wifiOnly) {
            try {
                const state = await Network.getNetworkStateAsync();
                if (state.type !== Network.NetworkStateType.WIFI) {
                    setIsOnWifi(false);
                    pendingDownloadsRef.current.push({ child, playlistId });
                    setPendingDownloadCount(pendingDownloadsRef.current.length);
                    showToast({ title: 'Wi-Fi Only Mode', subtitle: 'Download will start when connected to Wi-Fi', icon: IconWifi });
                    return;
                }
            } catch { }
        }
        const trackItem = convertToTrackItem(child);
        setDownloadingMeta(prev => new Map(prev).set(child.id, child));
        try {
            await actions.downloadTrack(trackItem, playlistId);
            showToast({ title: 'Downloading', subtitle: child.title, icon: IconDownload });
        } catch (e) {
            setDownloadingMeta(prev => {
                const next = new Map(prev);
                next.delete(child.id);
                return next;
            });
            showToast({ title: 'Download Error', subtitle: String(e), haptics: 'error', icon: IconCircleX });
        }
    }, [convertToTrackItem, actions.downloadTrack, wifiOnly]);

    const downloadTrackById = useCallback(async (id: string) => {
        const child = await cache.fetchChild(id);
        if (!child) return;
        await downloadTrack(child);
    }, [cache.fetchChild, downloadTrack]);

    const downloadPlaylist = useCallback(async (playlistId: string, tracks: Child[]) => {
        const currentProgress = progressMapRef.current;
        const newTracks = tracks.filter(t => !DownloadManager.isTrackDownloaded(t.id) && !DownloadManager.isDownloading(t.id) && !currentProgress.has(t.id));
        if (newTracks.length === 0) {
            showToast({ title: 'Already Downloaded', subtitle: `All ${tracks.length} tracks are downloaded` });
            return;
        }
        if (wifiOnly) {
            try {
                const state = await Network.getNetworkStateAsync();
                if (state.type !== Network.NetworkStateType.WIFI) {
                    setIsOnWifi(false);
                    for (const track of newTracks) {
                        pendingDownloadsRef.current.push({ child: track, playlistId });
                    }
                    setPendingDownloadCount(pendingDownloadsRef.current.length);
                    showToast({ title: 'Wi-Fi Only Mode', subtitle: `${newTracks.length} downloads will start when connected to Wi-Fi`, icon: IconWifi });
                    return;
                }
            } catch { }
        }
        const trackItems = newTracks.map(convertToTrackItem);
        setDownloadingMeta(prev => {
            const next = new Map(prev);
            newTracks.forEach(track => next.set(track.id, track));
            return next;
        });
        try {
            await actions.downloadPlaylist(playlistId, trackItems);
            const skipped = tracks.length - newTracks.length;
            const subtitle = skipped > 0
                ? `${newTracks.length} tracks (${skipped} already downloaded)`
                : `${newTracks.length} tracks`;
            showToast({ title: 'Downloading', subtitle, icon: IconDownload });
        } catch (e) {
            setDownloadingMeta(prev => {
                const next = new Map(prev);
                newTracks.forEach(track => next.delete(track.id));
                return next;
            });
            showToast({ title: 'Download Error', subtitle: String(e), haptics: 'error', icon: IconCircleX });
        }
    }, [convertToTrackItem, actions.downloadPlaylist, wifiOnly]);

    useEffect(() => {
        startPendingRef.current = () => {
            const pending = pendingDownloadsRef.current.splice(0);
            if (pending.length === 0) return;
            setPendingDownloadCount(0);
            showToast({ title: 'Wi-Fi Connected', subtitle: `Starting ${pending.length} pending download${pending.length > 1 ? 's' : ''}`, icon: IconWifi });
            for (const { child, playlistId } of pending) {
                const trackItem = convertToTrackItem(child);
                setDownloadingMeta(prev => new Map(prev).set(child.id, child));
                actions.downloadTrack(trackItem, playlistId).catch(() => {});
            }
        };
    }, [convertToTrackItem, actions.downloadTrack]);

    const deleteTrack = useCallback(async (trackId: string) => {
        await actions.deleteTrack(trackId);
        downloaded.refresh();
        storage.refresh();
    }, [actions.deleteTrack, downloaded.refresh, storage.refresh]);

    const deleteAll = useCallback(async () => {
        await actions.deleteAll();
        downloaded.refresh();
        storage.refresh();
    }, [actions.deleteAll, downloaded.refresh, storage.refresh]);

    const getDownloadingMeta = useCallback((trackId: string): Child | undefined => {
        return downloadingMeta.get(trackId);
    }, [downloadingMeta]);

    useEffect(() => {
        const missingTrackIds: string[] = [];
        progressMap.forEach((_, trackId) => {
            if (!downloadingMeta.has(trackId) && !metaFetchUnavailableRef.current.has(trackId)) {
                missingTrackIds.push(trackId);
            }
        });

        if (missingTrackIds.length === 0) return;

        missingTrackIds.forEach(trackId => {
            if (metaFetchInFlightRef.current.has(trackId)) return;
            metaFetchInFlightRef.current.add(trackId);

            cache.fetchChild(trackId)
                .then(child => {
                    if (!child) {
                        metaFetchUnavailableRef.current.add(trackId);
                        return;
                    }
                    setDownloadingMeta(prev => {
                        if (prev.has(trackId)) return prev;
                        const next = new Map(prev);
                        next.set(trackId, child);
                        return next;
                    });
                })
                .catch(() => undefined)
                .finally(() => {
                    metaFetchInFlightRef.current.delete(trackId);
                });
        });
    }, [progressMap, downloadingMeta, cache.fetchChild]);

    const pauseDownload = useCallback(async (downloadId: string) => {
        try {
            await actions.pauseDownload(downloadId);
        } catch (e) {
            showToast({ title: 'Pause Failed', subtitle: String(e), haptics: 'error', icon: IconCircleX });
            throw e;
        }
    }, [actions.pauseDownload]);

    const resumeDownload = useCallback(async (downloadId: string) => {
        try {
            await actions.resumeDownload(downloadId);
        } catch (e) {
            showToast({ title: 'Resume Failed', subtitle: String(e), haptics: 'error', icon: IconCircleX });
            throw e;
        }
    }, [actions.resumeDownload]);

    const cancelDownload = useCallback(async (downloadId: string) => {
        try {
            await actions.cancelDownload(downloadId);
        } catch (e) {
            showToast({ title: 'Cancel Failed', subtitle: String(e), haptics: 'error', icon: IconCircleX });
            throw e;
        }
    }, [actions.cancelDownload]);

    const retryDownload = useCallback(async (downloadId: string) => {
        try {
            await actions.retryDownload(downloadId);
        } catch (e) {
            showToast({ title: 'Retry Failed', subtitle: String(e), haptics: 'error', icon: IconCircleX });
            throw e;
        }
    }, [actions.retryDownload]);

    const filteredActiveDownloads = useMemo(() =>
        Array.from(progressMap.values()).filter(p =>
            p.state === 'pending' || p.state === 'downloading' || p.state === 'paused'
        ),
        [progressMap]
    );

    const isDownloading = useMemo(() =>
        Array.from(progressMap.values()).some(p => p.state === 'downloading'),
        [progressMap]
    );

    const getTrackProgress = useCallback((trackId: string) =>
        progressMap.get(trackId),
        [progressMap]
    );

    const contextValue = useMemo<DownloadContextType>(() => ({
        downloadTrack,
        downloadTrackById,
        downloadPlaylist,
        deleteTrack,
        deleteAll,
        cancelDownload,
        pauseDownload,
        resumeDownload,
        retryDownload,
        isTrackDownloaded: downloaded.isTrackDownloaded,
        getTrackProgress,
        getDownloadingMeta,
        downloadedTracks: downloaded.downloadedTracks,
        activeDownloads: filteredActiveDownloads,
        refreshDownloaded: downloaded.refresh,
        isDownloading,
        storageInfo: storage.storageInfo,
        formattedSize: storage.formattedSize,
        refreshStorage: storage.refresh,
        wifiOnlyBlocked,
        pendingDownloadCount,
    }), [
        downloadTrack, downloadTrackById, downloadPlaylist, deleteTrack, deleteAll,
        cancelDownload, pauseDownload, resumeDownload, retryDownload,
        downloaded.isTrackDownloaded, getTrackProgress, getDownloadingMeta,
        downloaded.downloadedTracks, filteredActiveDownloads, downloaded.refresh,
        isDownloading, storage.storageInfo, storage.formattedSize, storage.refresh,
        wifiOnlyBlocked, pendingDownloadCount,
    ]);

    return (
        <DownloadContext.Provider value={contextValue}>
            {children}
        </DownloadContext.Provider>
    );
}
