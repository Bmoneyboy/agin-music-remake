import { SQLiteDatabase } from 'expo-sqlite';

export default async function initDatabase(db: SQLiteDatabase) {
    await db.execAsync('PRAGMA journal_mode = WAL');
    await db.execAsync('PRAGMA foreign_keys = ON');

    await db.execAsync(`CREATE TABLE IF NOT EXISTS childrenCache (
        id TEXT not null,
        data TEXT not null,
        primary key (id)
    )`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS lyricsCache (
        id TEXT not null,
        data TEXT not null,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP not null,
        primary key (id)
    )`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS pins (
        id TEXT not null,
        name TEXT not null,
        description TEXT not null,
        type TEXT not null,
        coverArt TEXT not null,
        pinOrder INT not null,
        primary key (id)
        )`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS searchHistory (
        id TEXT not null,
        name TEXT not null,
        description TEXT not null,
        type TEXT not null,
        coverArt TEXT not null,
        searchedAt DATETIME DEFAULT CURRENT_TIMESTAMP not null,
        primary key (id)
    )`);

    // Local playback history. Track metadata is denormalised on purpose so the
    // history still renders when the server is unreachable or the track was
    // deleted server-side.
    await db.execAsync(`CREATE TABLE IF NOT EXISTS playbackHistory (
        rowId INTEGER PRIMARY KEY AUTOINCREMENT,
        trackId TEXT not null,
        title TEXT not null,
        artist TEXT,
        artistId TEXT,
        album TEXT,
        albumId TEXT,
        coverArt TEXT,
        duration INTEGER,
        playedAt INTEGER not null,
        msPlayed INTEGER not null,
        serverKey TEXT not null
    )`);

    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_playbackHistory_playedAt
        ON playbackHistory (serverKey, playedAt DESC)`);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_playbackHistory_trackId
        ON playbackHistory (serverKey, trackId)`);

    // Outbox for scrobbles that could not be submitted (offline, server down).
    // Flushed with the original timestamp so play times stay accurate.
    await db.execAsync(`CREATE TABLE IF NOT EXISTS scrobbleQueue (
        rowId INTEGER PRIMARY KEY AUTOINCREMENT,
        trackId TEXT not null,
        playedAt INTEGER not null,
        attempts INTEGER not null DEFAULT 0,
        serverKey TEXT not null
    )`);

    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_scrobbleQueue_serverKey
        ON scrobbleQueue (serverKey, playedAt)`);
}