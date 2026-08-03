#!/usr/bin/env npx tsx
/**
 * Verifies tutor sheet layout math and conversation send/retry rules.
 * No React Native runtime and no AI calls.
 */
import {
  clampSheetHeight,
  computeSnapHeights,
  computeUsableHeight,
  nearestSnap,
  nextSnap,
  resolveSheetHeight,
  snapForKeyboardOpen,
  usableHeightAboveKeyboard,
  TUTOR_MIN_SHEET_HEIGHT,
} from '../src/components/tutor/tutorLayout';
import {
  appendUserTurn,
  canSendTutorMessage,
  historyForRetry,
  shouldPreserveConversationOnCardChange,
  trimTutorInput,
} from '../src/components/tutor/tutorConversationLogic';

function check(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`  ✓ ${name}`);
}

function main(): void {
  console.log('verify-tutor-layout');

  // Small iPhone-ish
  {
    const usable = computeUsableHeight(667, 44);
    const snaps = computeSnapHeights(usable);
    check('small screen usable height subtracts safe area', usable === 667 - 44 - 12);
    check('compact ~35-40%', snaps.compact / usable > 0.34 && snaps.compact / usable < 0.42);
    check('expanded ~65-70%', snaps.expanded / usable > 0.64 && snaps.expanded / usable < 0.72);
    check('full uses usable height', snaps.full === usable);
  }

  // Large screen
  {
    const usable = computeUsableHeight(932, 59);
    const snaps = computeSnapHeights(usable);
    check('large screen full equals usable', snaps.full === usable);
    check('nearest snap prefers closest', nearestSnap(snaps.expanded - 10, snaps) === 'expanded');
    check('nearest snap to full', nearestSnap(snaps.full - 5, snaps) === 'full');
  }

  check(
    'clamps sheet height',
    clampSheetHeight(100, 220, 400) === 220 && clampSheetHeight(500, 220, 400) === 400,
  );

  check('keyboard opens compact → expanded', snapForKeyboardOpen('compact') === 'expanded');
  check('keyboard keeps expanded', snapForKeyboardOpen('expanded') === 'expanded');
  check('keyboard keeps full', snapForKeyboardOpen('full') === 'full');

  {
    const above = usableHeightAboveKeyboard(800, 50, 300);
    check(
      'keyboard-visible minimum height',
      above >= TUTOR_MIN_SHEET_HEIGHT && above === computeUsableHeight(800, 50) - 300,
    );
  }

  {
    const usable = computeUsableHeight(800, 40);
    const snaps = computeSnapHeights(usable);
    const withKb = resolveSheetHeight({
      snap: 'compact',
      snaps,
      maxAvailable: usable - 280,
      keyboardVisible: true,
    });
    check('compact-to-expanded when keyboard opens', withKb.snap === 'expanded');
    check(
      'height capped above keyboard',
      withKb.height <= usable - 280 && withKb.height >= TUTOR_MIN_SHEET_HEIGHT,
    );
  }

  {
    const usable = computeUsableHeight(800, 40);
    const snaps = computeSnapHeights(usable);
    const full = resolveSheetHeight({
      snap: 'full',
      snaps,
      maxAvailable: usable,
      keyboardVisible: false,
    });
    check('full-screen calculation uses full snap', full.snap === 'full' && full.height === snaps.full);

    const afterKb = resolveSheetHeight({
      snap: 'expanded',
      snaps,
      maxAvailable: usable,
      keyboardVisible: false,
    });
    check('state after keyboard closes keeps expanded', afterKb.snap === 'expanded');
  }

  check('nextSnap expand chain', nextSnap('compact', 'expand') === 'expanded');
  check('nextSnap to full', nextSnap('expanded', 'expand') === 'full');
  check('nextSnap collapse', nextSnap('full', 'collapse') === 'expanded');

  // Conversation rules
  check('trims input', trimTutorInput('  hi  ') === 'hi');
  check(
    'duplicate send prevention while loading',
    canSendTutorMessage({ input: 'hello', loading: true, inFlight: false }) === false,
  );
  check(
    'duplicate send prevention while in flight',
    canSendTutorMessage({ input: 'hello', loading: false, inFlight: true }) === false,
  );
  check(
    'empty message blocked',
    canSendTutorMessage({ input: '   ', loading: false, inFlight: false }) === false,
  );
  check(
    'valid send allowed',
    canSendTutorMessage({ input: 'hello', loading: false, inFlight: false }) === true,
  );

  {
    const history = appendUserTurn([], 'Explain this');
    const retried = historyForRetry(history);
    check('retry does not duplicate a message', retried.length === 1 && history.length === 1);
    check(
      'retry history matches prior turn',
      retried[0]?.content === 'Explain this' && retried[0]?.role === 'user',
    );
  }

  check(
    'card change within lesson preserves conversation',
    shouldPreserveConversationOnCardChange('lesson-1', 'lesson-1') === true,
  );
  check(
    'leaving lesson does not preserve conversation identity',
    shouldPreserveConversationOnCardChange('lesson-1', 'lesson-2') === false,
  );

  console.log('verify-tutor-layout: all checks passed');
}

main();
