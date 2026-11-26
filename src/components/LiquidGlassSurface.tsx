import React, {ReactNode} from 'react';
import {Platform, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {BlurView} from 'expo-blur';
import LinearGradient from 'react-native-linear-gradient';

interface LiquidGlassSurfaceProps {
  children: ReactNode;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
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
}: LiquidGlassSurfaceProps) => {
  return (
    <View
      style={[
        styles.surface,
        selected ? styles.selected : styles.idle,
        style,
      ]}
      renderToHardwareTextureAndroid={Platform.OS === 'android'}>
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
      <View pointerEvents="none" style={styles.topRim} />
      <View pointerEvents="none" style={styles.bottomRim} />
      <View style={styles.content}>{children}</View>
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
