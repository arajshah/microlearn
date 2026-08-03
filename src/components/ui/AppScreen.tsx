import React from 'react';
import { ScrollViewProps, StyleSheet, View, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CosmicBackground } from '@/components/cosmic/CosmicBackground';
import { spacing } from '@/theme/theme';
import { AppRefreshConfig, AppRefreshScrollView } from './AppRefreshScrollView';

type AppScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  bottomInset?: boolean;
  contentStyle?: ViewProps['style'];
  /** Atmosphere variant for the cosmic background. */
  atmosphere?: 'default' | 'nebula' | 'calm';
} & Omit<ViewProps, 'style'> & {
    style?: ViewProps['style'];
  };

type AppScrollScreenProps = AppScreenProps & {
  scroll: true;
  scrollProps?: Omit<ScrollViewProps, 'style' | 'contentContainerStyle'>;
  refresh?: AppRefreshConfig;
};

export function AppScreen(props: AppScreenProps | AppScrollScreenProps) {
  const {
    children,
    scroll = false,
    padded = true,
    bottomInset = true,
    contentStyle,
    style,
    atmosphere = 'default',
    ...rest
  } = props;
  const insets = useSafeAreaInsets();
  const basePadding = padded ? spacing.lg : 0;
  const topPadding = insets.top + (padded ? spacing.md : 0);
  const bottomPadding = bottomInset ? insets.bottom + spacing.xxl : spacing.xxl;

  if (scroll) {
    const scrollProps = 'scrollProps' in props ? props.scrollProps : undefined;
    return (
      <CosmicBackground variant={atmosphere}>
        <AppRefreshScrollView
          style={[styles.screen, style]}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: topPadding,
              paddingBottom: bottomPadding,
              paddingHorizontal: basePadding,
            },
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}
          refresh={'refresh' in props ? props.refresh : undefined}
          {...scrollProps}
        >
          {children}
        </AppRefreshScrollView>
      </CosmicBackground>
    );
  }

  return (
    <CosmicBackground variant={atmosphere}>
      <View
        style={[
          styles.screen,
          {
            paddingTop: topPadding,
            paddingBottom: bottomPadding,
            paddingHorizontal: basePadding,
          },
          style,
          contentStyle,
        ]}
        {...rest}
      >
        {children}
      </View>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    gap: spacing.xl,
  },
});
