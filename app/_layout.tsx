import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProgressProvider } from '@/context/ProgressContext';
import { LibraryProvider } from '@/context/LibraryContext';
import { ReviewProvider } from '@/context/ReviewContext';
import { ChallengeProvider } from '@/context/ChallengeContext';
import { BookmarksProvider } from '@/context/BookmarksContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { RoadmapProvider } from '@/context/RoadmapContext';
import { LegacyCleanupBootstrap } from '@/components/LegacyCleanupBootstrap';
import { colors } from '@/theme/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <PreferencesProvider>
        <ProgressProvider>
          <ReviewProvider>
            <ChallengeProvider>
              <BookmarksProvider>
                <LibraryProvider>
                  <RoadmapProvider>
                  <LegacyCleanupBootstrap />
                  <StatusBar style="light" />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg },
                      animation: 'slide_from_right',
                    }}
                  >
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen
                      name="lesson/[id]"
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen name="subject/[id]" />
                    <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
                    <Stack.Screen
                      name="review"
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="retrieve-session"
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="tutor"
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="challenge"
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="search"
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen name="saved" />
                    <Stack.Screen
                      name="lightning"
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="listen/[id]"
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="onboarding"
                      options={{ animation: 'fade', gestureEnabled: false }}
                    />
                    <Stack.Screen
                      name="roadmap/[roadmapId]"
                      options={{ animation: 'slide_from_right' }}
                    />
                  </Stack>
                  </RoadmapProvider>
                </LibraryProvider>
              </BookmarksProvider>
            </ChallengeProvider>
          </ReviewProvider>
        </ProgressProvider>
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
