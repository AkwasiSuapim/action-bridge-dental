import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme';
import { fonts, space } from '../theme/tokens';
import { AppText } from './ui';

/** ActionBridge leaf mark (design v3, original vector). Decorative: the lockup carries the label. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id="abLeafA" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#69FFA5" />
          <Stop offset="1" stopColor="#31E981" />
        </LinearGradient>
        <LinearGradient id="abLeafB" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#31E981" />
          <Stop offset="1" stopColor="#0E6B4D" />
        </LinearGradient>
      </Defs>
      <Path d="M19 24C11 24 5.5 18.5 5 9.5c8.5.2 14 5.2 14 14.5Z" fill="url(#abLeafA)" />
      <Path d="M21 24c0-9.3 5.5-14.3 14-14.5-.5 9-6 14.5-14 14.5Z" fill="url(#abLeafB)" />
      <Path d="M6 33.5c3.8-5 8.5-7.5 14-7.5s10.2 2.5 14 7.5" stroke="#31E981" strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Mark + "ActionBridge | Dental", read by screen readers as one label. */
export function BrandLockup({ size = 30 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="ActionBridge Dental" style={{ flexDirection: 'row', alignItems: 'center', gap: space(2.5) }}>
      <BrandMark size={size} />
      <AppText variant="heading" accessibilityRole="text" style={{ fontFamily: fonts.bold }}>
        ActionBridge
      </AppText>
      <View style={{ width: 1, height: 16, backgroundColor: colors.border }} />
      <AppText variant="heading" accessibilityRole="text" muted style={{ fontFamily: fonts.medium }}>
        Dental
      </AppText>
    </View>
  );
}
