import axios from 'axios';
import { createContext, useCallback, useEffect, useState, useMemo } from 'react';
import { fixUrl, generateSubsonicToken } from '@lib/util';
import { BaseResponse, DiscoverServerResult, OpenSubsonicExtensions } from '@lib/types';
import config from '../constants/config';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Server = {
    url: string;
    authMethod: '' | 'openid' | 'apiKey' | 'saltedPassword' | 'password';
    auth: {
        username?: string;
        password?: string;
        apiKey?: string;
    };
    version: string;
    extensions: OpenSubsonicExtensions[];
};

export type ServerAuth = {
    salt?: string;
    hash?: string;
}

export const initialServer: Server = {
    url: '',
    authMethod: '',
    auth: {

    },
    version: '',
    extensions: [],
}

export type ServerContextType = {
    server: Server;
    serverAuth: ServerAuth;
    discoverServer: (url: string) => Promise<DiscoverServerResult> | void;
    saveAndTestPasswordCredentials: (username: string, password: string, serverOverride?: string, authMethodOverride?: Server['authMethod']) => Promise<boolean>;
    isLoading: boolean;
    logOut: () => Promise<void>;
}

const initialServerContext: ServerContextType = {
    server: initialServer,
    serverAuth: {},
    discoverServer: () => { },
    saveAndTestPasswordCredentials: async () => { return false; },
    isLoading: true,
    logOut: async () => { },
}

export const ServerContext = createContext<ServerContextType>(initialServerContext);

export default function ServerProvider({ children }: { children?: React.ReactNode }) {
    const [server, setServer] = useState<Server>(initialServer);
    const [serverAuth, setServerAuth] = useState<ServerAuth>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (server.url == '') return;
        (async () => {
            try {
                if (server?.auth?.password) {
                    await SecureStore.setItemAsync('password', server.auth.password);
                }

                const { auth, ...rest } = server || {};
                const serverObject = { ...rest, auth: { ...auth, password: undefined, apiKey: undefined } };

                await AsyncStorage.setItem('server', JSON.stringify(serverObject));
            } catch (error) {
                console.error('Error saving server data:', error);
            }
        })();
    }, [server]);

    useEffect(() => {
        (async () => {
            try {
                let updatedServer = { ...initialServer };

                const serverStored = await AsyncStorage.getItem('server');
                if (serverStored) {
                    const serverInfo = JSON.parse(serverStored);
                    updatedServer = { ...updatedServer, ...serverInfo };
                }

                const storedPassword = await SecureStore.getItemAsync('password');
                if (storedPassword) {
                    updatedServer.auth = { ...updatedServer.auth, password: storedPassword };
                }

                setServer(updatedServer);

                setIsLoading(false);
            } catch (error) {
                console.error('Error loading server data:', error);
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            if (!server.auth.password) return;
            if (server.authMethod === 'password') return;
            const { salt, hash } = await generateSubsonicToken(server.auth.password);
            setServerAuth({ salt, hash });
        })();
    }, [server.auth.password, server.authMethod]);

    const discoverServer = useCallback(async (url: string): Promise<DiscoverServerResult> => {
        let correctUrl = '';
        let authMethod: Server['authMethod'] = '';
        try {
            correctUrl = fixUrl(url);

            const rawRes = await axios.get(`${correctUrl}/rest/getOpenSubsonicExtensions`, {
                params: {
                    c: `${config.clientName}/${config.clientVersion}`,
                    f: 'json',
                    v: config.protocolVersion,
                }
            });

            const res = rawRes.data['subsonic-response'] as (BaseResponse & { openSubsonicExtensions: OpenSubsonicExtensions[] });

            if (res.status != 'ok' && res.status != 'failed') {
                if (res.status == 'failed') {
                    // Server rejects /getOpenSubsonicExtensions but still returns a valid response
                    authMethod = 'saltedPassword';
                }
                return {
                    success: false,
                    error: 0,
                    url: correctUrl,
                }
            }

            // let authMethod = 'saltedPassword';
            // let serverData:Server = initialServer;
            // if (res.openSubsonicExtensions.find(e => e.name == 'apiKeyAuthentication')) {
            //     // TODO: Implement API Key auth
            //     // authMethod = 'apiKey';
            // } else {
            //     // Assume support for salted passwords
            // }
            // serverData = {
            //     auth: {

            //     }
            // }

            authMethod = res.openSubsonicExtensions?.find(e => e.name == 'apiKeyAuthentication') ? 'apiKey' : 'saltedPassword';

            const serverData: Server = {
                url: correctUrl,
                extensions: res.openSubsonicExtensions,
                version: res.serverVersion,
                authMethod,
                auth: {

                }
            }

            setServer(serverData);

            return {
                success: true,
                server: serverData,
                url: correctUrl,
            }
        } catch (error) {
            console.error(error);
            return {
                success: false,
                error: 'ERR_SERVER_UNREACHABLE',
                url: correctUrl,
            }
        }
    }, []);

    const saveAndTestPasswordCredentials = useCallback(async (username: string, password: string, serverOverride?: string, authMethodOverride?: Server['authMethod']) => {
        // TODO: Add error handling
        const url = serverOverride ? serverOverride : server.url;
        const authMethod = authMethodOverride ?? server.authMethod;

        if (authMethod === 'password') {
            try {
                const rawRes = await axios.get(`${url}/rest/ping`, {
                    params: {
                        c: `${config.clientName}/${config.clientVersion}`,
                        f: 'json',
                        v: config.protocolVersion,
                        u: username,
                        p: password,
                    }
                });
                const res = rawRes.data['subsonic-response'] as BaseResponse;
                if (res.status != 'ok') return false;

                setServer(s => ({ ...s, auth: { ...s.auth, username, password }, authMethod: 'password' }));
            } catch (error) {
                return false;
            }
            return true;
        }

        const { salt, hash } = await generateSubsonicToken(password);

        try {
            const rawRes = await axios.get(`${url}/rest/ping`, {
                params: {
                    c: `${config.clientName}/${config.clientVersion}`,
                    f: 'json',
                    v: config.protocolVersion,
                    u: username,
                    t: hash,
                    s: salt,
                }
            });
            const res = rawRes.data['subsonic-response'] as BaseResponse;
            if (res.status != 'ok') return false;

            setServer(s => ({ ...s, auth: { ...s.auth, username, password } }));
        } catch (error) {
            return false;
        }
        return true;
    }, [server.url]);

    const logOut = useCallback(async () => {
        setServer(initialServer);
        setServerAuth({});
        await SecureStore.deleteItemAsync('password');
        await AsyncStorage.removeItem('server');
    }, []);

    const value = useMemo<ServerContextType>(() => ({
        server, serverAuth, discoverServer, saveAndTestPasswordCredentials, isLoading, logOut,
    }), [server, serverAuth, discoverServer, saveAndTestPasswordCredentials, isLoading, logOut]);

    return (
        <ServerContext.Provider value={value}>
            {children}
        </ServerContext.Provider>
    )
}