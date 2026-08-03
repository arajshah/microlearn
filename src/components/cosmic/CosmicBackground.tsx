import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors, gradients } from '@/theme/theme';

type Variant = 'default' | 'nebula' | 'calm';

/**
 * Static deep-space atmosphere. No continuous particle animation —
 * light fields only, cheap to paint on iPhone and web.
 */
export function CosmicBackground({
  variant = 'default',
  children,
}: {
  variant?: Variant;
  children?: React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const stars = useMemo(() => buildStarField(width, height), [width, height]);

  const gradient =
    variant === 'nebula'
      ? gradients.nebulaViolet
      : variant === 'calm'
        ? gradients.calm
        : gradients.cosmos;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <LinearGradient
        colors={gradient.length === 3 ? gradient : [gradient[0], gradient[1], colors.bg]}
        locations={gradient.length === 3 ? [0, 0.45, 1] : [0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Soft nebula pools — restrained, non-animated */}
      <View style={[styles.pool, styles.poolA]} />
      <View style={[styles.pool, styles.poolB]} />
      <View style={styles.starLayer} pointerEvents="none">
        {stars.map((s) => (
          <View
            key={s.id}
            style={[
              styles.star,
              {
                left: s.x,
                top: s.y,
                width: s.size,
                height: s.size,
                opacity: s.opacity,
                borderRadius: s.size,
              },
            ]}
          />
        ))}
      </View>
      {children}
    </View>
  );
}

function buildStarField(width: number, height: number) {
  const count = Math.min(48, Math.max(24, Math.floor((width * height) / 28000)));
  const out: Array<{ id: string; x: number; y: number; size: number; opacity: number }> = [];
  // Deterministic pseudo-random from dimensions so layout is stable across re-renders.
  let seed = Math.floor(width * 13 + height * 7) || 1;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < count; i += 1) {
    out.push({
      id: `s${i}`,
      x: next() * width,
      y: next() * height,
      size: next() > 0.85 ? 2.2 : 1.2,
      opacity: 0.18 + next() * 0.45,
    });
  }
  return out;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  starLayer: { ...StyleSheet.absoluteFillObject },
  star: { position: 'absolute', backgroundColor: colors.star },
  pool: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.22,
  },
  poolA: {
    width: 220,
    height: 220,
    top: -40,
    right: -60,
    backgroundColor: colors.horizon,
  },
  poolB: {
    width: 260,
    height: 260,
    bottom: '18%',
    left: -100,
    backgroundColor: colors.signal,
    opacity: 0.1,
  },
});
