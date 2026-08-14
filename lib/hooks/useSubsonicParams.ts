import { useState, useEffect, useMemo } from 'react';
import { generateSubsonicToken } from '../util';
import { useServer } from './useServer';
import config from '../constants/config';

export type SubsonicParams = {
    /** Client name */
    c: string;

    /** Username */
    u: string;

    /** Token (salted MD5 hash of the password) */
    t?: string;

    /** Salt used in the token */
    s?: string;

    /** Plain password (for legacy authentication) */
    p?: string;

    /** Protocol version */
    v: string;

    /** Format */
    f: string;
} | null;

export function useSubsonicParams(): SubsonicParams {
    const { server, serverAuth } = useServer();

    const params = useMemo(() => {
        if (server.authMethod === 'password') {
            return {
                c: `${config.clientName}/${config.clientVersion}`,
                f: 'json',
                v: config.protocolVersion,
                u: server.auth.username ?? '',
                p: server.auth.password ?? '',
            };
        }

        return {
            c: `${config.clientName}/${config.clientVersion}`,
            f: 'json',
            v: config.protocolVersion,
            u: server.auth.username ?? '',
            t: serverAuth.hash ?? '',
            s: serverAuth.salt ?? '',
        };
    }, [server.url, server.auth.username, server.auth.password, server.authMethod, serverAuth.hash, serverAuth.salt]);

    if (!serverAuth && server.authMethod !== 'password') return null;

    return params;
}