import Button from '@lib/components/Button';
import { Input } from '@lib/components/Input';
import { SetupPage } from '@lib/components/SetupPage';
import Title from '@lib/components/Title';
import { useColors, useServer } from '@lib/hooks';
import { IconKey, IconUser } from '@tabler/icons-react-native';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Switch, TextInput, TouchableHighlight, View } from 'react-native';
import { SheetManager } from 'react-native-actions-sheet';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [useLegacyAuth, setUseLegacyAuth] = useState(false);
    const [loading, setLoading] = useState(false);
    const colors = useColors();

    const server = useServer();

    const passwordRef = useRef<TextInput>(null);

    const logIn = useCallback(async () => {
        if (username === '' || password === '') return;
        setLoading(true);

        const authMethod = useLegacyAuth ? 'password' : undefined;
        const success = await server.saveAndTestPasswordCredentials(username, password, undefined, authMethod);
        if (!success) {
            setLoading(false);
            await SheetManager.show('confirm', {
                payload: {
                    title: 'Error',
                    message: 'Username or password is incorrect. Please try again.',
                    confirmText: 'OK',
                    withCancel: false
                }
            });
            return;
        }

        setLoading(false);
        router.replace('/');
    }, [username, password, server.saveAndTestPasswordCredentials, useLegacyAuth]);

    const styles = useMemo(() => ({
        container: {
            gap: 10,
        },
    }), []);

    return (
        <SetupPage
            icon={IconKey}
            title='Enter username and password'
            description='Enter your username and password to get started.'
            actions={<Button disabled={username === '' || password === '' || loading} onPress={logIn}>Done</Button>}
        >
            <View style={styles.container}>
                <Input
                    icon={IconUser}
                    placeholder='Username...'
                    autoCapitalize='none'
                    autoCorrect={false}
                    autoFocus
                    value={username}
                    onChangeText={setUsername}
                    returnKeyType='next'
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    textContentType='username'
                    autoComplete='username'
                    submitBehavior='submit'
                    enablesReturnKeyAutomatically
                />
                <Input
                    icon={IconKey}
                    placeholder='Password...'
                    secureTextEntry
                    autoCapitalize='none'
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType='done'
                    ref={passwordRef}
                    onSubmitEditing={logIn}
                    textContentType='password'
                    autoComplete='current-password'
                    submitBehavior='submit'
                    enablesReturnKeyAutomatically
                />
                <TouchableHighlight
                    onPress={() => setUseLegacyAuth(!useLegacyAuth)}
                    underlayColor={colors.secondaryBackground}
                >
                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingHorizontal: 20,
                        paddingVertical: 10,
                    }}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                            <Title size={14}>Legacy Authentication</Title>
                            <Title size={12} color={colors.text[1]} fontFamily="Poppins-Regular">Use plain password for Nextcloud Music</Title>
                        </View>
                        <Switch
                            trackColor={{ false: colors.segmentedControlBackground, true: colors.forcedTint }}
                            thumbColor={colors.text[0]}
                            ios_backgroundColor={colors.segmentedControlBackground}
                            value={useLegacyAuth}
                            onValueChange={setUseLegacyAuth}
                        />
                    </View>
                </TouchableHighlight>
            </View>
        </SetupPage>
    )
}
