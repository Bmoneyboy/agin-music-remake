import { Colors } from '@/lib/constants/Colors';
import { ColorSchemeOverride } from '@lib/providers/ColorSchemeOverride';
import { useContext, useEffect, useState } from 'react';
import { AppState, ColorSchemeName, useColorScheme } from 'react-native';
import { Appearance } from 'react-native';

export type UseColorsOptions = {
    forceTheme?: 'light' | 'dark';
}

export function useColors(options?: UseColorsOptions) {
    const override = useContext(ColorSchemeOverride);

    const [currentTheme, setTheme] = useState<'light' | 'dark'>(
        (override ?? Appearance.getColorScheme() ?? 'light') === 'dark' ? 'dark' : 'light',
    );

    useEffect(() => {
        if (override) return setTheme(override === 'dark' ? 'dark' : 'light');
        const listener = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                const theme = Appearance.getColorScheme();
                setTheme(theme === 'dark' ? 'dark' : 'light');
            }
        });

        return () => {
            listener.remove();
        }
    }, [override]);

    return Colors[options?.forceTheme ?? currentTheme];
}