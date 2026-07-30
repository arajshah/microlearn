import React from 'react';
import {
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  View,
  ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/theme';

type AppScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  bottomInset?: boolean;
  contentStyle?: ViewProps['style'];
} & Omit<ViewProps, 'style'> & {
    style?: ViewProps['style'];
  };

type AppScrollScreenProps = AppScreenProps & {
  scroll: true;
  scrollProps?: Omit<ScrollViewProps, 'style' | 'contentContainerStyle'>;
};

export function AppScreen(props: AppScreenProps | AppScrollScreenProps) {
  const {
    children,
    scroll = false,
    padded = true,
    bottomInset = true,
    contentStyle,
    style,
    ...rest
  } = props;
  const insets = useSafeAreaInsets();
  const basePadding = padded ? spacing.lg : 0;
  const topPadding = insets.top + (padded ? spacing.md : 0);
  const bottomPadding = bottomInset ? insets.bottom + spacing.xxl : spacing.xxl;

  if (scroll) {
    const scrollProps = 'scrollProps' in props ? props.scrollProps : undefined;
    return (
      <ScrollView
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
        {...scrollProps}
      >
        {children}
      </ScrollView>
    );
  }

  return (
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
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    gap: spacing.xl,
  },
});
