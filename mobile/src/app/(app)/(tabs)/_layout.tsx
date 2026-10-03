import { Tabs } from 'expo-router';
import { House, User } from 'lucide-react-native';
import { useTheme } from '../../../theme/theme';
import { fonts, palettes, type Palette } from '../../../theme/tokens';

/**
 * Main tabs (design v3 tab bar). Home is always dark, so its tab bar uses the dark palette;
 * other tabs follow the system theme. My plan and Activity join when cases can be listed.
 */
function barOptions(colors: Palette) {
  return {
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
  };
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 } }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', ...barOptions(palettes.dark), tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', ...barOptions(colors), tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tabs>
  );
}
