import React, {ReactNode, useCallback, useState} from 'react';
import {Platform, requireNativeComponent, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {BlurView} from 'expo-blur';
import LinearGradient from 'react-native-linear-gradient';


type GlassRefractionNativeProps = {
  style?: StyleProp<ViewStyle>;
  touchX: number;
  touchY: number;
  pulse: number;
};

const NativeGlassRefraction = Platform.OS === 'android'
  ? requireNativeComponent<GlassRefractionNativeProps>('VegaGlassRefraction')
  : null;

interface LiquidGlassSurfaceProps {
  children: ReactNode;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Reusable optical-glass treatment for Vega surfaces.
 *
 * This is the cross-platform material layer (backdrop blur, soft specular
 * highlights, edge tint and restrained depth). It intentionally does not
 * claim pixel refraction: true lens distortion requires a native backdrop
 * capture + shader pipeline and is handled as a separate platform layer.
 */
const LiquidGlassSurface = ({
  children,
  selected = false,
  style,
  contentStyle,
}: LiquidGlassSurfaceProps) => {
  // A touch creates two soft travelling wavefronts, like a drop landing on
  // water. The overlay never captures input, so row reorder and tab gestures
  // continue to receive the original touch stream.
  const [nativeTouch, setNativeTouch] = useState({x: 0, y: 0, pulse: 0});
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const waveSize = useSharedValue(0);
  const waveOpacity = useSharedValue(0);
  const secondSize = useSharedValue(0);
  const secondOpacity = useSharedValue(0);
  const waveRadius = useSharedValue(1);
  const surfaceWidth = useSharedValue(1);
  const surfaceHeight = useSharedValue(1);

  const handleTouch = useCallback((event: any) => {
    const touch =
      event.nativeEvent?.changedTouches?.[0] ??
      event.nativeEvent?.touches?.[0] ??
      event.nativeEvent;
    const locationX = touch?.locationX ?? 0;
    const locationY = touch?.locationY ?? 0;
    const width = surfaceWidth.value;
    const height = surfaceHeight.value;
    // A conservative radius keeps the wave contained even when layout data
    // is unavailable; the surface clips both rings to its rounded outline.
    touchX.value = locationX;
    touchY.value = locationY;
    setNativeTouch(previous => ({x: locationX, y: locationY, pulse: previous.pulse + 1}));
    waveRadius.value = Math.max(90, Math.hypot(width, height) * 0.72);
    cancelAnimation(waveSize);
    cancelAnimation(waveOpacity);
    cancelAnimation(secondSize);
    cancelAnimation(secondOpacity);
    waveSize.value = 0.04;
    waveOpacity.value = 0.24;
    secondSize.value = 0.02;
    secondOpacity.value = 0.15;
    waveSize.value = withTiming(1, {duration: 720});
    waveOpacity.value = withTiming(0, {duration: 720});
    secondSize.value = withDelay(95, withTiming(1, {duration: 820}));
    secondOpacity.value = withDelay(95, withTiming(0, {duration: 820}));
  }, [
    secondOpacity,
    secondSize,
    surfaceHeight,
    surfaceWidth,
    touchX,
    touchY,
    waveOpacity,
    waveRadius,
    waveSize,
  ]);

  const handleLayout = useCallback((event: any) => {
    surfaceWidth.value = event.nativeEvent.layout.width;
    surfaceHeight.value = event.nativeEvent.layout.height;
  }, [surfaceHeight, surfaceWidth]);

  const firstWaveStyle = useAnimatedStyle(() => ({
    left: touchX.value - waveRadius.value,
    top: touchY.value - waveRadius.value,
    width: waveRadius.value * 2,
    height: waveRadius.value * 2,
    opacity: waveOpacity.value,
    transform: [{scale: waveSize.value}],
  }));
  const secondWaveStyle = useAnimatedStyle(() => ({
    left: touchX.value - waveRadius.value,
    top: touchY.value - waveRadius.value,
    width: waveRadius.value * 2,
    height: waveRadius.value * 2,
    opacity: secondOpacity.value,
    transform: [{scale: secondSize.value}],
  }));

  return (
    <View
      style={[
        styles.surface,
        selected ? styles.selected : styles.idle,
        style,
      ]}
      renderToHardwareTextureAndroid={Platform.OS === 'android'}
      onTouchStart={handleTouch}
      onLayout={handleLayout}>
      <BlurView
        pointerEvents="none"
        tint="dark"
        intensity={Platform.OS === 'android' ? 34 : 42}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={
          selected
            ? [
                'rgba(255,255,255,0.16)',
                'rgba(255,30,66,0.055)',
                'rgba(255,255,255,0.018)',
              ]
            : [
                'rgba(255,255,255,0.105)',
                'rgba(255,255,255,0.025)',
                'rgba(255,255,255,0.012)',
              ]
        }
        locations={[0, 0.42, 1]}
        start={{x: 0.12, y: 0}}
        end={{x: 0.88, y: 1}}
        style={StyleSheet.absoluteFill}
      />
      {NativeGlassRefraction ? (
        <NativeGlassRefraction
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          touchX={nativeTouch.x}
          touchY={nativeTouch.y}
          pulse={nativeTouch.pulse}
        />
      ) : null}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View
          pointerEvents="none"
          style={[styles.waterWave, firstWaveStyle]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.waterWave, styles.waterWaveSecond, secondWaveStyle]}
        />
      </View>
      <View pointerEvents="none" style={styles.topRim} />
      <View pointerEvents="none" style={styles.bottomRim} />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  surface: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  idle: {
    borderColor: 'rgba(255,255,255,0.13)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  selected: {
    borderColor: 'rgba(255,74,101,0.72)',
    backgroundColor: 'rgba(255,30,66,0.095)',
    shadowColor: '#FF1E42',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 2},
    elevation: 4,
  },
  content: {
    zIndex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  waterWave: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.25,
    borderColor: 'rgba(235,248,255,0.78)',
    backgroundColor: 'rgba(215,238,255,0.045)',
    shadowColor: '#D8F4FF',
    shadowOpacity: 0.55,
    shadowRadius: 9,
    shadowOffset: {width: 0, height: 0},
    elevation: 2,
  },
  waterWaveSecond: {
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: 'rgba(255,255,255,0.018)',
    shadowOpacity: 0.28,
    shadowRadius: 5,
  },
  topRim: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.48)',
    opacity: 0.65,
  },
  bottomRim: {
    position: 'absolute',
    bottom: 0,
    left: 14,
    right: 14,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
});

export default LiquidGlassSurface;
