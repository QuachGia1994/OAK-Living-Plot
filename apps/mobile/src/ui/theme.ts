import { Platform } from 'react-native';

export const colors = {
  ink: '#F2EBDD',
  inkMuted: '#AAA094',
  background: '#0C0B0A',
  surface: '#151310',
  surfaceRaised: '#1C1814',
  surfaceWarm: '#21170F',
  surfaceWarmDeep: '#281B10',
  surfaceSuccess: '#111914',
  surfaceSuccessPill: '#17231A',
  surfaceDanger: '#261718',
  surfaceAccentPill: '#2B1E10',
  surfaceQuiet: '#11100E',
  border: '#302A23',
  borderSubtle: '#211D18',
  borderStrong: '#4A4035',
  borderSuccess: '#314B39',
  accent: '#D9A45E',
  accentStrong: '#F0C17D',
  accentSoft: '#8F6434',
  accentInk: '#211609',
  danger: '#E58A82',
  success: '#8DCAA2',
  overlay: '#0F0E0C',
  storyInk: '#D8CFC1',
  placeholder: '#70675E',
  quietInk: '#80776D',
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
    scene: 28,
    choice: 20,
  },
  overlay: {
    top: 'rgba(4, 4, 4, 0.34)',
    middle: 'rgba(4, 4, 4, 0.12)',
    subtitle: 'rgba(5, 5, 5, 0.82)',
    strong: 'rgba(4, 4, 4, 0.9)',
    hairline: 'rgba(255, 248, 236, 0.18)',
  },
  scene: {
    tense: {
      base: '#140A0A',
      deep: '#090506',
      glow: '#7A251F',
      rim: '#E56D58',
      haze: '#351313',
    },
    romantic: {
      base: '#140B10',
      deep: '#090508',
      glow: '#7C294F',
      rim: '#EF8DB4',
      haze: '#31111F',
    },
    mysterious: {
      base: '#080D16',
      deep: '#05070C',
      glow: '#243E7A',
      rim: '#78A6FF',
      haze: '#111B33',
    },
    hopeful: {
      base: '#0A1210',
      deep: '#050907',
      glow: '#2E7157',
      rim: '#91D7B4',
      haze: '#12281E',
    },
  },
} as const;
