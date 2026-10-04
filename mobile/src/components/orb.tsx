import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme';

/**
 * Agent orb (design v3 "Dental-Orb"). Decorative only: status is always stated in text nearby.
 * `active` spins faster than `idle`; `success` and `alert` show an icon. All motion stops under
 * reduced motion, and `alert` never moves.
 */
export type OrbMode = 'idle' | 'active' | 'success' | 'alert';

/** Native-driver animation on phones; browsers have no native animated module. */
const NATIVE_DRIVER = Platform.OS !== 'web';
const RING_ANGLES_A = [0, 60, 120];
const RING_ANGLES_B = [30, 90, 150];

export function AgentOrb({ size = 170, mode = 'idle' }: { size?: number; mode?: OrbMode }) {
  const { reduceMotion } = useTheme();
  const amber = mode === 'alert';
  const tint = amber ? '#FFC46B' : '#31E981';
  const glow = amber ? '#FFE0B0' : '#69FFA5';
  const moving = !reduceMotion && mode !== 'alert';
  const active = mode === 'active';

  const spinA = useRef(new Animated.Value(0)).current;
  const spinB = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!moving) {
      spinA.setValue(0);
      spinB.setValue(0);
      breathe.setValue(0.5);
      return;
    }
    const loops = [
      Animated.loop(Animated.timing(spinA, { toValue: 1, duration: active ? 9000 : 24000, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER })),
      Animated.loop(Animated.timing(spinB, { toValue: 1, duration: active ? 14000 : 38000, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER })),
    ];
    if (mode !== 'success') {
      const half = active ? 900 : 2600;
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.timing(breathe, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE_DRIVER }),
            Animated.timing(breathe, { toValue: 0, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE_DRIVER }),
          ]),
        ),
      );
    }
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [moving, active, mode, spinA, spinB, breathe]);

  const rotateA = spinA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateB = spinB.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] });
  const ringScale = mode === 'success' ? 0.82 : 1;
  const ringScaleB = mode === 'success' ? 0.7 : 0.86;
  const iconSize = Math.round(size * 0.22);
  const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

  const rings = (angles: number[], halo: boolean, width: number) =>
    angles.map((angle) => (
      <G key={angle} transform={`rotate(${angle} 100 100)`}>
        {halo ? <Ellipse cx={100} cy={100} rx={68} ry={40} fill="none" stroke={tint} strokeOpacity={0.07} strokeWidth={14} /> : null}
        <Ellipse cx={100} cy={100} rx={68} ry={40} fill="none" stroke={tint} strokeOpacity={0.18} strokeWidth={5.6} />
        <Ellipse cx={100} cy={100} rx={68} ry={40} fill="none" stroke={`url(#orbRing-${amber ? 'a' : 'g'})`} strokeWidth={width} />
      </G>
    ));

  return (
    <View style={{ width: size, height: size }} aria-hidden>
      <Svg viewBox="0 0 200 200" width={size} height={size} style={fill}>
        <Defs>
          <RadialGradient id={`orbCore-${amber ? 'a' : 'g'}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tint} stopOpacity={0.22} />
            <Stop offset="0.55" stopColor={tint} stopOpacity={0.07} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={100} cy={100} r={100} fill={`url(#orbCore-${amber ? 'a' : 'g'})`} />
        <Circle cx={100} cy={100} r={98} fill="none" stroke={tint} strokeOpacity={0.08} strokeWidth={1} />
        <Circle cx={100} cy={100} r={82} fill="none" stroke={tint} strokeOpacity={0.1} strokeWidth={1} />
      </Svg>
      <Animated.View style={[fill, { transform: [{ scale }] }]}>
        <Animated.View style={[fill, { transform: [{ scale: ringScale }, { rotate: rotateA }] }]}>
          <Svg viewBox="0 0 200 200" width={size} height={size}>
            <Defs>
              <LinearGradient id={`orbRing-${amber ? 'a' : 'g'}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={glow} stopOpacity={1} />
                <Stop offset="0.5" stopColor={tint} stopOpacity={0.55} />
                <Stop offset="1" stopColor={glow} stopOpacity={0.95} />
              </LinearGradient>
            </Defs>
            {rings(RING_ANGLES_A, true, 1.6)}
          </Svg>
        </Animated.View>
        <Animated.View style={[fill, { opacity: 0.55, transform: [{ scale: ringScaleB }, { rotate: rotateB }] }]}>
          <Svg viewBox="0 0 200 200" width={size} height={size}>
            <Defs>
              <LinearGradient id={`orbRing-${amber ? 'a' : 'g'}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={glow} stopOpacity={1} />
                <Stop offset="0.5" stopColor={tint} stopOpacity={0.55} />
                <Stop offset="1" stopColor={glow} stopOpacity={0.95} />
              </LinearGradient>
            </Defs>
            {rings(RING_ANGLES_B, false, 1.4)}
          </Svg>
        </Animated.View>
      </Animated.View>
      {mode === 'success' || mode === 'alert' ? (
        <View style={[fill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={mode === 'success' ? '#69FFA5' : '#FFC46B'} strokeWidth={mode === 'success' ? 3 : 2.2} strokeLinecap="round" strokeLinejoin="round">
            {mode === 'success' ? (
              <Path d="M20 6 9 17l-5-5" />
            ) : (
              <Path d="M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3 M12 9v4 M12 17h.01" />
            )}
          </Svg>
        </View>
      ) : null}
    </View>
  );
}
