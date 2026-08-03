/**
 * Microlearn design tokens — deep-space foundation for the cosmic learning universe.
 * Prefer these tokens over hard-coded colors in screens and components.
 */

export const colors = {
  bg: '#070B14',
  bgElevated: '#0E1524',
  surface: '#162033',
  surfaceAlt: '#1C2A42',
  border: '#2A3A58',
  borderSoft: '#1A2740',

  /** Soft nebula wash for elevated panels */
  nebula: '#1A2438',
  atmosphere: '#121A2C',

  text: '#F4F7FC',
  textMuted: '#9AA8C7',
  textFaint: '#6B7A99',

  primary: '#8BA4FF',
  primaryDark: '#5B74D6',

  success: '#3DDBA8',
  successDark: '#0C322A',
  danger: '#F87171',
  dangerDark: '#3D1717',
  warning: '#FBBF24',
  disabled: '#3A4660',

  /** Celestial highlights */
  star: '#E8F0FF',
  constellation: '#9EB6FF',
  signal: '#5EEAD4',
  horizon: '#C4B5FD',

  today: '#56C4F5',
  retrieve: '#F5A623',
  paths: '#A78BFA',
  create: '#C084FC',
  profile: '#34D399',

  streak: '#FF9D42',
  xp: '#FFD166',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export const gradients = {
  today: ['#56C4F5', '#2563EB'] as [string, string],
  retrieve: ['#F5A623', '#EA580C'] as [string, string],
  paths: ['#A78BFA', '#4F46E5'] as [string, string],
  create: ['#C084FC', '#7C3AED'] as [string, string],
  profile: ['#34D399', '#059669'] as [string, string],
  calm: ['#121A2C', '#070B14'] as [string, string],
  cosmos: ['#121A2C', '#0A1020', '#070B14'] as [string, string, string],
  nebulaViolet: ['#1A1630', '#0E1524'] as [string, string],
  nebulaTeal: ['#10242C', '#0E1524'] as [string, string],
  completion: ['#1A2438', '#0B1220'] as [string, string],
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const font = {
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    xxxl: 36,
    display: 44,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
  },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  glow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  starGlow: {
    shadowColor: colors.constellation,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

export const motion = {
  fast: 160,
  normal: 280,
  slow: 480,
  pulse: 900,
} as const;
