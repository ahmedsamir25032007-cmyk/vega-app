import {StyleSheet, View} from 'react-native';
import React, {memo} from 'react';
import {BlurView} from 'expo-blur';
import LinearGradient from 'react-native-linear-gradient';

const TabBarBackgound = memo(() => {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <BlurView
        tint="dark"
        intensity={38}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(12,13,18,0.58)',
            borderTopColor: 'rgba(255,255,255,0.18)',
            borderTopWidth: StyleSheet.hairlineWidth,
          },
        ]}
      />
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.12)',
          'rgba(255,255,255,0.025)',
          'rgba(255,255,255,0.005)',
        ]}
        locations={[0, 0.35, 1]}
        start={{x: 0.5, y: 0}}
        end={{x: 0.5, y: 1}}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 18,
          right: 18,
          height: StyleSheet.hairlineWidth,
          backgroundColor: 'rgba(255,255,255,0.42)',
        }}
      />
    </View>
  );
});

export default TabBarBackgound;
