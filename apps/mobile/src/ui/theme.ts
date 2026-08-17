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
