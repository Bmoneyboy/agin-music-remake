import { Icon, IconProps } from '@tabler/icons-react-native';
import React, { useEffect, useMemo } from 'react';
import { ColorValue, StyleSheet, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useColors } from '../hooks/useColors';

export type ActionIconVariant = 'subtle' | 'subtleFilled' | 'primary' | 'secondary' | 'secondaryTransparent' | 'secondaryFilled';

export type ActionIconProps = {
    icon: Icon;
    size?: number;
    iconProps?: IconProps;
    iconColor?: ColorValue;
    isFilled?: boolean;
    stroke?: ColorValue;
    variant?: ActionIconVariant;
    disabled?: boolean;
    extraSize?: number;
    onPress?: (e: any) => void;
}

type VariantConfig = {
    styles: ViewStyle;
    iconColor: ColorValue;
    backgroundColor: string;
    tapBackgroundColor: string;
    extraSize: number;
}

const ActionIcon = ({ icon: Icon, size = 24, isFilled = false, stroke, iconColor, iconProps, variant = 'subtle', disabled = false, onPress, extraSize }: ActionIconProps) => {
    const colors = useColors();

    const variantStyles = useMemo<Record<ActionIconVariant, VariantConfig>>(() => ({
        subtle: {
            styles: {},
            backgroundColor: '#ffffff00',
            tapBackgroundColor: '#ffffff15',
            iconColor: colors.text[0],
            extraSize: extraSize ?? 18,
        },
        subtleFilled: {
            styles: {},
            backgroundColor: '#ffffff10',
            tapBackgroundColor: '#ffffff25',
            iconColor: colors.text[0],
            extraSize: extraSize ?? 18,
        },
        primary: {
            styles: {},
            iconColor: colors.tintText,
            backgroundColor: colors.tint,
            tapBackgroundColor: colors.tint,
            extraSize: extraSize ?? 24,
        },
        secondary: {
            styles: {},
            iconColor: colors.text[0],
            backgroundColor: '#ffffff10',
            tapBackgroundColor: '#ffffff05',
            extraSize: extraSize ?? 12,
        },
        secondaryFilled: {
            styles: {},
            iconColor: colors.tintText,
            backgroundColor: colors.tint,
            tapBackgroundColor: colors.tint + '90',
            extraSize: extraSize ?? 12,
        },
        secondaryTransparent: {
            styles: {},
            iconColor: colors.text[1],
            backgroundColor: '#ffffff00',
            tapBackgroundColor: '#ffffff15',
            extraSize: extraSize ?? 12,
        },
    }), [colors, disabled, extraSize]);

    const styles = useMemo(() => StyleSheet.create({
        container: {
            width: size + variantStyles[variant].extraSize,
            height: size + variantStyles[variant].extraSize,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 999999,
            ...variantStyles[variant].styles,
        }
    }), [size, variant, variantStyles]);

    const scaleDownAnimation = useSharedValue(1);
    const opacity = useSharedValue(1);
    const backgroundColor = useSharedValue(variantStyles[variant].backgroundColor);

    useEffect(() => {
        backgroundColor.value = withSpring(variantStyles[variant].backgroundColor);
    }, [variant]);

    const scaleHandler = Gesture.Tap()
        .onBegin(() => {
            "worklet";
            scaleDownAnimation.value = withSpring(0.8);
            opacity.value = withSpring(0.5);
            backgroundColor.value = withSpring(variantStyles[variant].tapBackgroundColor);
        })
        .onEnd((e, success) => {
            "worklet";
            if (success && onPress && !disabled) {
                runOnJS(onPress)(e);
            }
        })
        .onFinalize(() => {
            "worklet";
            scaleDownAnimation.value = withSpring(1);
            opacity.value = withSpring(1);
            backgroundColor.value = withSpring(variantStyles[variant].backgroundColor);
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scaleDownAnimation.value }],
        opacity: disabled ? .3 : opacity.value,
        backgroundColor: backgroundColor.value,
    }), [variant, variantStyles]);

    const iconCol = iconColor ?? variantStyles[variant].iconColor;

    return (
        <GestureDetector gesture={scaleHandler}>
            <Animated.View style={[styles.container, animatedStyle]}>
                <Icon color={iconCol} fill={isFilled ? iconCol : 'transparent'} size={size} stroke={stroke ?? iconCol} {...iconProps} />
            </Animated.View>
        </GestureDetector>
    )
}

export default React.memo(ActionIcon);
