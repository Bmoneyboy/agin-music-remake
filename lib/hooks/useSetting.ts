import { SettingId } from "@/app/(tabs)/(index,library,search)/settings";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { DeviceEventEmitter } from "react-native";

export type SettingValue = boolean | string | undefined;

const SETTING_CHANGE_EVENT = 'setting:change';

export function emitSettingChange(id: SettingId, value: SettingValue) {
    DeviceEventEmitter.emit(SETTING_CHANGE_EVENT, { id, value });
}

export function useSetting(settingName: SettingId): SettingValue {
    const [value, setValue] = useState<SettingValue>(undefined);

    useEffect(() => {
        (async () => {
            const value = await AsyncStorage.getItem(`settings.${settingName}`);
            if (!value) return;

            setValue(JSON.parse(value));
        })();
    }, [settingName]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(SETTING_CHANGE_EVENT, (event: { id: SettingId; value: SettingValue }) => {
            if (event.id === settingName) {
                setValue(event.value);
            }
        });
        return () => sub.remove();
    }, [settingName]);

    return value;
}