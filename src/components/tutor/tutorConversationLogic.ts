/**
 * Pure helpers for tutor send/retry rules (used by verification scripts).
 */

export type TutorTurn = { role: 'user' | 'assistant'; content: string };

export function trimTutorInput(input: string): string {
  return input.trim();
}

export function canSendTutorMessage(options: {
  input: string;
  loading: boolean;
  inFlight: boolean;
}): boolean {
  return Boolean(trimTutorInput(options.input)) && !options.loading && !options.inFlight;
}

/** Append a user turn for a new send. */
export function appendUserTurn(messages: TutorTurn[], text: string): TutorTurn[] {
  const content = trimTutorInput(text);
  if (!content) return messages;
  return [...messages, { role: 'user', content }];
}

/**
 * Retry uses the existing history as-is (failed turn already includes the user message).
 * Must not append another copy of the user message.
 */
export function historyForRetry(messages: TutorTurn[]): TutorTurn[] {
  return messages.slice();
}

export function shouldPreserveConversationOnCardChange(
  previousLessonId: string,
  nextLessonId: string,
): boolean {
  return previousLessonId === nextLessonId && previousLessonId.length > 0;
}
