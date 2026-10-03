/**
 * ActionBridge visual system (mobile doc §1): green palette, Plus Jakarta Sans, 4-point spacing,
 * 44-point minimum hit area. Amber and red are for warnings and errors only, always with text.
 */
export const palettes = {
  light: {
    background: '#F5F7F2',
    surface: '#FFFFFF',
    surfaceMuted: '#EAF0E8',
    border: '#D5DDD6',
    text: '#101512',
    textMuted: '#4A564F',
    primary: '#0E6B4D',
    onPrimary: '#FFFFFF',
    primarySoft: '#D7EFE3',
    projected: '#8CC7AE',
    warning: '#7A4F00',
    warningSoft: '#FFF4D6',
    danger: '#B42318',
    dangerSoft: '#FDECEA',
  },
  dark: {
    background: '#07110D',
    surface: '#101C17',
    surfaceMuted: '#16261F',
    border: '#22352C',
    text: '#F4F8F5',
    textMuted: '#A9B8AF',
    primary: '#31E981',
    onPrimary: '#07110D',
    primarySoft: '#123826',
    projected: '#1F7A52',
    warning: '#F5C451',
    warningSoft: '#2E2410',
    danger: '#FF8A80',
    dangerSoft: '#3A1512',
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)['light']]: string };

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const space = (steps: number) => steps * 4;

export const layout = {
  maxContentWidth: 680,
  minHitArea: 44,
  radius: 16,
  radiusSmall: 10,
} as const;
