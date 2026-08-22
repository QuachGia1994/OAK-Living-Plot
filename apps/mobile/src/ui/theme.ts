import { Platform } from 'react-native';

export const colors = {
  ink: '#F7F1E8',
  inkMuted: '#B8AEC3',
  background: '#07050C',
  surface: '#100C18',
  surfaceRaised: '#171021',
  surfaceWarm: '#1B1123',
  surfaceWarmDeep: '#24132F',
  surfaceSuccess: '#0E1713',
  surfaceSuccessPill: '#14231B',
  surfaceDanger: '#28141C',
  surfaceAccentPill: '#261A12',
  surfaceQuiet: '#0C0912',
  surfaceGlass: 'rgba(24, 15, 34, 0.88)',
  border: '#332743',
  borderSubtle: '#20172B',
  borderStrong: '#4B365F',
  borderGlow: '#6A43A0',
  borderSuccess: '#315640',
  accent: '#E3B25F',
  accentStrong: '#FFD58A',
  accentSoft: '#8D6230',
  accentInk: '#211406',
  violet: '#8B4DFF',
  violetStrong: '#B66CFF',
  violetSoft: '#5A2E8F',
  violetInk: '#180B28',
  danger: '#F08B9A',
  success: '#8DD2A7',
  overlay: '#0A0710',
  narrativeInk: '#E0D8E6',
  placeholder: '#746A80',
  quietInk: '#8C8296',
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 18,
  pill: 999,
} as const;

export const typography = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export const cinematic = {
  motion: {
    micro: 160,
    reveal: 280,
    scene: 420,
    consequence: 560,
  },
  radius: {
    scene: 30,
    choice: 20,
  },
  overlay: {
    top: 'rgba(5, 3, 10, 0.28)',
    middle: 'rgba(8, 4, 14, 0.14)',
    subtitle: 'rgba(9, 6, 14, 0.86)',
    strong: 'rgba(7, 4, 12, 0.93)',
    glass: 'rgba(19, 11, 29, 0.78)',
    hairline: 'rgba(246, 225, 255, 0.18)',
    violetHairline: 'rgba(182, 108, 255, 0.34)',
  },
  glow: {
    violet: 'rgba(139, 77, 255, 0.24)',
    gold: 'rgba(227, 178, 95, 0.18)',
  },
  scene: {
    tense: {
      base: '#15090F',
      deep: '#08040A',
      glow: '#7A263D',
      rim: '#F06C7E',
      haze: '#32101D',
    },
    romantic: {
      base: '#150A15',
      deep: '#080409',
      glow: '#7B2D63',
      rim: '#F08ABC',
      haze: '#35122B',
    },
    mysterious: {
      base: '#10081A',
      deep: '#06030A',
      glow: '#5A2E8F',
      rim: '#B66CFF',
      haze: '#241139',
    },
    hopeful: {
      base: '#091311',
      deep: '#040907',
      glow: '#2B6F57',
      rim: '#91D7B4',
      haze: '#10291E',
    },
  },
} as const;
