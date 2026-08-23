import { Platform } from 'react-native';

export const colors = {
  ink: '#F3E7CF',
  inkMuted: '#BDAF93',
  background: '#070806',
  surface: '#0E100D',
  surfaceRaised: '#151712',
  surfaceWarm: '#1A1710',
  surfaceWarmDeep: '#241D12',
  surfaceSuccess: '#101812',
  surfaceSuccessPill: '#17231A',
  surfaceDanger: '#271518',
  surfaceAccentPill: '#2A2114',
  surfaceQuiet: '#0A0B09',
  surfaceGlass: 'rgba(17, 18, 15, 0.88)',
  border: '#3A3326',
  borderSubtle: '#242117',
  borderStrong: '#69583A',
  borderGlow: '#98713E',
  borderSuccess: '#3A5A41',
  accent: '#C89A55',
  accentStrong: '#F0C879',
  accentSoft: '#8F6837',
  accentInk: '#1C1408',
  violet: '#9B6A35',
  violetStrong: '#D3A25D',
  violetSoft: '#6F4C2B',
  violetInk: '#1B1108',
  danger: '#DD8B8D',
  success: '#96C49E',
  overlay: '#080906',
  narrativeInk: '#DED2BB',
  placeholder: '#756B58',
  quietInk: '#91846C',
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
  sm: 5,
  md: 9,
  lg: 13,
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
    scene: 18,
    choice: 12,
  },
  overlay: {
    top: 'rgba(6, 7, 5, 0.28)',
    middle: 'rgba(8, 8, 6, 0.16)',
    subtitle: 'rgba(10, 10, 8, 0.88)',
    strong: 'rgba(7, 8, 6, 0.94)',
    glass: 'rgba(18, 18, 14, 0.8)',
    hairline: 'rgba(240, 216, 167, 0.18)',
    violetHairline: 'rgba(211, 162, 93, 0.38)',
  },
  glow: {
    violet: 'rgba(155, 106, 53, 0.22)',
    gold: 'rgba(200, 154, 85, 0.2)',
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
      base: '#11120F',
      deep: '#060705',
      glow: '#72552F',
      rim: '#D3A25D',
      haze: '#292318',
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

export const classical = {
  goldPale: '#F3D89C',
  gold: '#C99A54',
  goldDeep: '#6F4A23',
  bronze: '#8B6337',
  parchment: '#E8D9BC',
  soot: '#080906',
  inkGlass: 'rgba(12, 13, 10, 0.9)',
  hairline: 'rgba(218, 174, 103, 0.42)',
  hairlineSoft: 'rgba(218, 174, 103, 0.2)',
  patina: 'rgba(111, 74, 35, 0.18)',
} as const;
