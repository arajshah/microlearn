export const colors = {
  bg: '#0A0F1A',
  bgElevated: '#111827',
  surface: '#1A2236',
  surfaceAlt: '#222D45',
  border: '#2A3654',
  borderSoft: '#1E2940',

  text: '#F8FAFC',
  textMuted: '#94A3B8',
  textFaint: '#64748B',

  primary: '#7C9CFF',
  primaryDark: '#5B7AE8',

  success: '#34D399',
  successDark: '#0F3D33',
  danger: '#F87171',
  dangerDark: '#3D1717',
  warning: '#FBBF24',

  today: '#38BDF8',
  retrieve: '#F59E0B',
  paths: '#A78BFA',
  create: '#C084FC',
  profile: '#34D399',

  streak: '#FF9D42',
  xp: '#FFD166',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export const gradients = {
  today: ['#38BDF8', '#2563EB'],
  retrieve: ['#F59E0B', '#EA580C'],
  paths: ['#A78BFA', '#6366F1'],
  create: ['#C084FC', '#7C3AED'],
  profile: ['#34D399', '#059669'],
  calm: ['#111827', '#0A0F1A'],
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
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
  },
} as const;
