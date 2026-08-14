import { Child } from '@lib/types';
import { useApi, useQueue, useServer, useSetting } from '@lib/hooks';
import showToast from '@lib/showToast';
import { IconCircleCheck } from '@tabler/icons-react-native';
import { useSQLiteContext, SQLiteDatabase } from 'expo-sqlite';
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useOnPlaybackProgressChange, useOnPlaybackStateChange } from 'react-native-nitro-player';

/**
 * A play is only counted once the user has listened to half the track or four
 * minutes, whichever comes first — the same rule Last.fm and Navidrome use.
 * Tracks shorter than 30 seconds are never scrobbled.
 */
const SCROBBLE_MAX_THRESHOLD_MS = 4 * 60 * 1000;
const MIN_TRACK_DURATION_MS = 30 * 1000;

/** Progress deltas larger than this are treated as a seek, not listening time. */
const MAX_TICK_DELTA_MS = 4000;

/** Rows kept in playbackHistory before the oldest are pruned. */
const HISTORY_RETENTION_ROWS = 10000;

/** Give up on an outbox entry after this many failed submissions. */
const MAX_SCROBBLE_ATTEMPTS = 10;

const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

export type PlaybackHistoryItem = {
    rowId: number;
    trackId: string;
    title: string;
    artist: string | null;
    artistId: string | null;
    album: string | null;
    albumId: string | null;
    coverArt: string | null;
    duration: number | null;
    /** Epoch ms at which playback of this track started. */
    playedAt: number;
    /** Milliseconds actually listened to, excluding pauses and seeks. */
    msPlayed: number;
};

export type AggregateRow = {
    id: string;
    name: string;
    secondaryName: string | null;
    coverArt: string | null;
    playCount: number;
};

export type PlaybackHistoryContextType = {
    history: PlaybackHistoryItem[];
    pendingScrobbles: number;
    refresh: () => Promise<void>;
    getRecentTracks: (limit?: number) => Promise<PlaybackHistoryItem[]>;
    getTopTracks: (sinceMs?: number, limit?: number) => Promise<AggregateRow[]>;
    getTopAlbums: (sinceMs?: number, limit?: number) => Promise<AggregateRow[]>;
    getTopArtists: (sinceMs?: number, limit?: number) => Promise<AggregateRow[]>;
    clearAll: () => Promise<void>;
    flushScrobbleQueue: () => Promise<void>;
};

const initial: PlaybackHistoryContextType = {
    history: [],
    pendingScrobbles: 0,
    refresh: async () => { },
    getRecentTracks: async () => [],
    getTopTracks: async () => [],
    getTopAlbums: async () => [],
    getTopArtists: async () => [],
    clearAll: async () => { },
    flushScrobbleQueue: async () => { },
};

export const PlaybackHistoryContext = createContext<PlaybackHistoryContextType>(initial);

type ListenSession = {
    child: Child;
    /** Epoch ms when this listen started. */
    startedAt: number;
    /** Accumulated listening time in ms, pauses and seeks excluded. */
    listenedMs: number;
    /** Last observed player position in ms, used to compute deltas. */
    lastPositionMs: number;
    /** Track length in ms as reported by the player, falls back to metadata. */
    durationMs: number;
    /** Set once the play has been written to history, prevents double counting. */
    committed: boolean;
    /** Set once the "now playing" ping has been sent for this session. */
    pinged: boolean;
};

function thresholdFor(durationMs: number) {
    if (durationMs <= 0) return SCROBBLE_MAX_THRESHOLD_MS;
    return Math.min(SCROBBLE_MAX_THRESHOLD_MS, durationMs / 2);
}

export default function PlaybackHistoryProvider({ children }: { children?: React.ReactNode }) {
    const db = useSQLiteContext();
    const api = useApi();
    const { server } = useServer();

    const [history, setHistory] = useState<PlaybackHistoryItem[]>([]);
    const [pendingScrobbles, setPendingScrobbles] = useState(0);

    const historyEnabled = useSetting('history.enabled') as boolean | undefined;
    const scrobbleToServer = useSetting('history.scrobbleToServer') as boolean | undefined;

    // Both default to on when the user has never touched the setting.
    const enabled = historyEnabled !== false;
    const scrobbles = scrobbleToServer !== false;

    const serverKey = useMemo(
        () => `${server?.url ?? ''}|${server?.auth?.username ?? ''}`,
        [server?.url, server?.auth?.username],
    );

    // Refs so the tracker never has to re-subscribe when these change.
    const apiRef = useRef(api);
    const serverKeyRef = useRef(serverKey);
    const enabledRef = useRef(enabled);
    const scrobblesRef = useRef(scrobbles);
    useEffect(() => { apiRef.current = api; }, [api]);
    useEffect(() => { serverKeyRef.current = serverKey; }, [serverKey]);
    useEffect(() => { enabledRef.current = enabled; }, [enabled]);
    useEffect(() => { scrobblesRef.current = scrobbles; }, [scrobbles]);

    const refresh = useCallback(async () => {
        const rows = await db.getAllAsync<PlaybackHistoryItem>(
            `SELECT rowId, trackId, title, artist, artistId, album, albumId, coverArt, duration, playedAt, msPlayed
             FROM playbackHistory WHERE serverKey = $serverKey
             ORDER BY playedAt DESC LIMIT 200`,
            { $serverKey: serverKey },
        );
        setHistory(rows);

        const pending = await db.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM scrobbleQueue WHERE serverKey = $serverKey',
            { $serverKey: serverKey },
        );
        setPendingScrobbles(pending?.count ?? 0);
    }, [db, serverKey]);

    useEffect(() => { refresh(); }, [refresh]);

    const flushScrobbleQueue = useCallback(async () => {
        const currentApi = apiRef.current;
        const key = serverKeyRef.current;
        if (!currentApi || !scrobblesRef.current) return;

        const rows = await db.getAllAsync<{ rowId: number; trackId: string; playedAt: number; attempts: number }>(
            `SELECT rowId, trackId, playedAt, attempts FROM scrobbleQueue
             WHERE serverKey = $serverKey ORDER BY playedAt ASC LIMIT 50`,
            { $serverKey: key },
        );
        if (rows.length === 0) return;

        for (const row of rows) {
            try {
                const res = await currentApi.get('/scrobble', {
                    params: { id: row.trackId, time: row.playedAt, submission: true },
                });

                const body = res.data?.['subsonic-response'];
                const errorCode = body?.error?.code;

                // Code 70 (not found) and 0 (generic) will never succeed on retry.
                if (body?.status === 'ok' || errorCode === 70 || errorCode === 0) {
                    await db.runAsync('DELETE FROM scrobbleQueue WHERE rowId = $rowId', { $rowId: row.rowId });
                    continue;
                }

                throw new Error(`Scrobble rejected: ${errorCode}`);
            } catch {
                const attempts = row.attempts + 1;
                if (attempts >= MAX_SCROBBLE_ATTEMPTS) {
                    await db.runAsync('DELETE FROM scrobbleQueue WHERE rowId = $rowId', { $rowId: row.rowId });
                } else {
                    await db.runAsync('UPDATE scrobbleQueue SET attempts = $attempts WHERE rowId = $rowId', {
                        $attempts: attempts,
                        $rowId: row.rowId,
                    });
                }
                // Network is probably down — stop hammering it and retry later.
                break;
            }
        }

        const pending = await db.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM scrobbleQueue WHERE serverKey = $serverKey',
            { $serverKey: key },
        );
        setPendingScrobbles(pending?.count ?? 0);
    }, [db]);

    /** Writes a completed listen to local history and queues the server scrobble. */
    const commitPlay = useCallback(async (session: ListenSession) => {
        if (!enabledRef.current) return;

        const child = session.child;
        const key = serverKeyRef.current;

        await db.runAsync(
            `INSERT INTO playbackHistory
                (trackId, title, artist, artistId, album, albumId, coverArt, duration, playedAt, msPlayed, serverKey)
             VALUES ($trackId, $title, $artist, $artistId, $album, $albumId, $coverArt, $duration, $playedAt, $msPlayed, $serverKey)`,
            {
                $trackId: child.id,
                $title: child.title ?? '',
                $artist: child.artist ?? null,
                $artistId: child.artistId ?? null,
                $album: child.album ?? null,
                $albumId: child.albumId ?? null,
                $coverArt: child.coverArt ?? null,
                $duration: child.duration ?? null,
                $playedAt: session.startedAt,
                $msPlayed: Math.round(session.listenedMs),
                $serverKey: key,
            },
        );

        if (scrobblesRef.current) {
            await db.runAsync(
                'INSERT INTO scrobbleQueue (trackId, playedAt, serverKey) VALUES ($trackId, $playedAt, $serverKey)',
                { $trackId: child.id, $playedAt: session.startedAt, $serverKey: key },
            );
        }

        await pruneHistory(db, key);
        await refresh();
        await flushScrobbleQueue();
    }, [db, refresh, flushScrobbleQueue]);

    /** Fire-and-forget "now playing" ping. Never queued — it is worthless late. */
    const sendNowPlaying = useCallback(async (trackId: string) => {
        const currentApi = apiRef.current;
        if (!currentApi || !scrobblesRef.current) return;
        try {
            await currentApi.get('/scrobble', { params: { id: trackId, submission: false } });
        } catch {
            // Offline, nothing to do.
        }
    }, []);

    // Flush the outbox when the app comes back to the foreground, and on a slow
    // timer while it is open.
    useEffect(() => {
        flushScrobbleQueue();

        const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
            if (state === 'active') flushScrobbleQueue();
        });
        const interval = setInterval(flushScrobbleQueue, FLUSH_INTERVAL_MS);

        return () => {
            sub.remove();
            clearInterval(interval);
        };
    }, [flushScrobbleQueue]);

    const getRecentTracks = useCallback(async (limit = 50) => {
        return db.getAllAsync<PlaybackHistoryItem>(
            `SELECT rowId, trackId, title, artist, artistId, album, albumId, coverArt, duration, playedAt, msPlayed
             FROM playbackHistory WHERE serverKey = $serverKey
             ORDER BY playedAt DESC LIMIT $limit`,
            { $serverKey: serverKey, $limit: limit },
        );
    }, [db, serverKey]);

    const getTopTracks = useCallback(async (sinceMs = 0, limit = 20) => {
        return db.getAllAsync<AggregateRow>(
            `SELECT trackId as id, title as name, artist as secondaryName, coverArt, COUNT(*) as playCount
             FROM playbackHistory
             WHERE serverKey = $serverKey AND playedAt >= $since
             GROUP BY trackId ORDER BY playCount DESC, MAX(playedAt) DESC LIMIT $limit`,
            { $serverKey: serverKey, $since: sinceMs, $limit: limit },
        );
    }, [db, serverKey]);

    const getTopAlbums = useCallback(async (sinceMs = 0, limit = 20) => {
        return db.getAllAsync<AggregateRow>(
            `SELECT albumId as id, album as name, artist as secondaryName, coverArt, COUNT(*) as playCount
             FROM playbackHistory
             WHERE serverKey = $serverKey AND playedAt >= $since AND albumId IS NOT NULL
             GROUP BY albumId ORDER BY playCount DESC, MAX(playedAt) DESC LIMIT $limit`,
            { $serverKey: serverKey, $since: sinceMs, $limit: limit },
        );
    }, [db, serverKey]);

    const getTopArtists = useCallback(async (sinceMs = 0, limit = 20) => {
        return db.getAllAsync<AggregateRow>(
            `SELECT artistId as id, artist as name, NULL as secondaryName, coverArt, COUNT(*) as playCount
             FROM playbackHistory
             WHERE serverKey = $serverKey AND playedAt >= $since AND artistId IS NOT NULL
             GROUP BY artistId ORDER BY playCount DESC, MAX(playedAt) DESC LIMIT $limit`,
            { $serverKey: serverKey, $since: sinceMs, $limit: limit },
        );
    }, [db, serverKey]);

    const clearAll = useCallback(async () => {
        await db.runAsync('DELETE FROM playbackHistory WHERE serverKey = $serverKey', { $serverKey: serverKey });
        await db.runAsync('DELETE FROM scrobbleQueue WHERE serverKey = $serverKey', { $serverKey: serverKey });
        setHistory([]);
        setPendingScrobbles(0);
        await showToast({
            title: 'Playback history cleared',
            subtitle: 'Your local listening history has been deleted',
            icon: IconCircleCheck,
        });
    }, [db, serverKey]);

    const value = useMemo<PlaybackHistoryContextType>(() => ({
        history,
        pendingScrobbles,
        refresh,
        getRecentTracks,
        getTopTracks,
        getTopAlbums,
        getTopArtists,
        clearAll,
        flushScrobbleQueue,
    }), [history, pendingScrobbles, refresh, getRecentTracks, getTopTracks, getTopAlbums, getTopArtists, clearAll, flushScrobbleQueue]);

    return (
        <PlaybackHistoryContext.Provider value={value}>
            <ListenTracker onCommit={commitPlay} onStart={sendNowPlaying} />
            {children}
        </PlaybackHistoryContext.Provider>
    );
}

async function pruneHistory(db: SQLiteDatabase, serverKey: string) {
    await db.runAsync(
        `DELETE FROM playbackHistory WHERE serverKey = $serverKey AND rowId NOT IN (
            SELECT rowId FROM playbackHistory WHERE serverKey = $serverKey
            ORDER BY playedAt DESC LIMIT $limit
        )`,
        { $serverKey: serverKey, $limit: HISTORY_RETENTION_ROWS },
    );
}

/**
 * Renders nothing. It exists purely so the high-frequency progress and state
 * subscriptions re-render a leaf instead of the whole provider subtree.
 */
function ListenTracker({
    onCommit,
    onStart,
}: {
    onCommit: (session: ListenSession) => Promise<void>;
    onStart: (trackId: string) => Promise<void>;
}) {
    const { nowPlaying } = useQueue();
    const { position, totalDuration } = useOnPlaybackProgressChange();
    const { state } = useOnPlaybackStateChange();

    const sessionRef = useRef<ListenSession | null>(null);
    const onCommitRef = useRef(onCommit);
    const onStartRef = useRef(onStart);
    useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);
    useEffect(() => { onStartRef.current = onStart; }, [onStart]);

    // Depend on the id, not the object: nowPlaying is re-created whenever the
    // track is starred, and that must not look like a new play.
    const trackId = nowPlaying?.id ?? '';

    const finalise = useCallback((session: ListenSession | null) => {
        if (!session || session.committed) return;
        const durationMs = session.durationMs || (session.child.duration ?? 0) * 1000;
        if (durationMs > 0 && durationMs < MIN_TRACK_DURATION_MS) return;
        if (session.listenedMs < thresholdFor(durationMs)) return;

        session.committed = true;
        onCommitRef.current(session).catch(() => { });
    }, []);

    useEffect(() => {
        const previous = sessionRef.current;
        if (previous?.child.id === trackId) return;

        finalise(previous);

        if (!trackId) {
            sessionRef.current = null;
            return;
        }

        sessionRef.current = {
            child: nowPlaying,
            startedAt: Date.now(),
            listenedMs: 0,
            lastPositionMs: 0,
            durationMs: 0,
            committed: false,
            pinged: false,
        };
    }, [trackId, nowPlaying, finalise]);

    useEffect(() => {
        const session = sessionRef.current;
        if (!session) return;

        const positionMs = (position ?? 0) * 1000;
        const durationMs = (totalDuration ?? 0) * 1000;
        if (durationMs > 0) session.durationMs = durationMs;

        // Position jumped back to the start with the same track loaded: repeat
        // one, or the user seeked home. Either way it is a new listen.
        if (positionMs < 1000 && session.lastPositionMs > 5000) {
            finalise(session);
            sessionRef.current = {
                child: session.child,
                startedAt: Date.now(),
                listenedMs: 0,
                lastPositionMs: positionMs,
                durationMs: session.durationMs,
                committed: false,
                pinged: false,
            };
            return;
        }

        if (state === 'playing') {
            if (!session.pinged) {
                session.pinged = true;
                onStartRef.current(session.child.id).catch(() => { });
            }

            const delta = positionMs - session.lastPositionMs;
            // Negative means a backwards seek, oversized means a forward seek.
            if (delta > 0 && delta <= MAX_TICK_DELTA_MS) {
                session.listenedMs += delta;
            }
        }

        session.lastPositionMs = positionMs;

        if (!session.committed) {
            const effectiveDuration = session.durationMs || (session.child.duration ?? 0) * 1000;
            if (effectiveDuration >= MIN_TRACK_DURATION_MS && session.listenedMs >= thresholdFor(effectiveDuration)) {
                session.committed = true;
                onCommitRef.current(session).catch(() => { });
            }
        }
    }, [position, totalDuration, state, finalise]);

    // Commit whatever is in flight when the app is backgrounded or torn down.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            if (next !== 'active') finalise(sessionRef.current);
        });
        return () => {
            finalise(sessionRef.current);
            sub.remove();
        };
    }, [finalise]);

    return null;
}
