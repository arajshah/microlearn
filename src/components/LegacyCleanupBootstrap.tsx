import React, { useEffect } from 'react';
import { runLegacyDataCleanup } from '@/storage/cleanupLegacyData';

/** Runs one-time legacy cleanup on app startup. */
export function LegacyCleanupBootstrap() {
  useEffect(() => {
    runLegacyDataCleanup().catch(() => {});
  }, []);
  return null;
}
