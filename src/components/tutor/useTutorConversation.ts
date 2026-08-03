import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isServerConfigured,
  requestServerTutorReply,
  ServerGenerationError,
} from '@/services/microlearnServer';

export type TutorMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export type TutorScrollReason = 'user-send' | 'loading' | 'assistant' | null;

let messageSeq = 0;
function nextMessageId(role: string): string {
  messageSeq += 1;
  return `${role}-${Date.now()}-${messageSeq}`;
}

export interface UseTutorConversationOptions {
  context?: string;
  /** When false, send is blocked with a connect message. */
  serverConfigured: boolean;
  /** Reset conversation when this identity changes (lesson leave). */
  sessionKey?: string;
}

export interface TutorConversationState {
  messages: TutorMessage[];
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  error: string | null;
  canRetry: boolean;
  serverConfigured: boolean;
  send: (text?: string) => void;
  retry: () => void;
  clear: () => void;
  scrollReason: TutorScrollReason;
  acknowledgeScroll: () => void;
}

/**
 * Chat/network state for the tutor. Presentation (sheet vs fullscreen) stays separate.
 * Conversation is scoped to the lesson session via sessionKey.
 */
export function useTutorConversation({
  context,
  serverConfigured,
  sessionKey,
}: UseTutorConversationOptions): TutorConversationState {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [scrollReason, setScrollReason] = useState<TutorScrollReason>(null);

  const inFlightRef = useRef(false);
  const messagesRef = useRef(messages);
  const contextRef = useRef(context);
  const sessionRef = useRef(sessionKey);

  messagesRef.current = messages;
  contextRef.current = context;

  useEffect(() => {
    if (sessionRef.current === sessionKey) return;
    sessionRef.current = sessionKey;
    inFlightRef.current = false;
    setMessages([]);
    setInput('');
    setLoading(false);
    setError(null);
    setCanRetry(false);
    setScrollReason(null);
  }, [sessionKey]);

  const acknowledgeScroll = useCallback(() => {
    setScrollReason(null);
  }, []);

  const clear = useCallback(() => {
    if (inFlightRef.current) return;
    setMessages([]);
    setInput('');
    setError(null);
    setCanRetry(false);
    setScrollReason(null);
  }, []);

  const runRequest = useCallback(
    async (history: TutorMessage[]) => {
      if (inFlightRef.current) return;
      if (!serverConfigured || !isServerConfigured()) {
        setError('Connect to the Microlearn server in Settings to chat with the tutor.');
        setCanRetry(false);
        return;
      }

      inFlightRef.current = true;
      setLoading(true);
      setError(null);
      setCanRetry(false);
      setScrollReason('loading');

      try {
        const payload = history.map(({ role, content }) => ({ role, content }));
        const reply = await requestServerTutorReply(payload, contextRef.current);
        setMessages((prev) => [
          ...prev,
          { id: nextMessageId('assistant'), role: 'assistant', content: reply },
        ]);
        setScrollReason('assistant');
      } catch (e) {
        const msg =
          e instanceof ServerGenerationError
            ? e.message
            : 'Something went wrong. Try again.';
        setError(msg);
        setCanRetry(true);
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [serverConfigured],
  );

  const send = useCallback(
    (text?: string) => {
      const trimmed = (text ?? input).trim();
      if (!trimmed || inFlightRef.current || loading) return;

      const userMessage: TutorMessage = {
        id: nextMessageId('user'),
        role: 'user',
        content: trimmed,
      };
      const history = [...messagesRef.current, userMessage];
      setMessages(history);
      setInput('');
      setScrollReason('user-send');
      void runRequest(history);
    },
    [input, loading, runRequest],
  );

  const retry = useCallback(() => {
    if (inFlightRef.current || loading) return;
    const history = messagesRef.current;
    if (history.length === 0) return;
    // Retry the failed turn only — do not append the user message again.
    void runRequest(history);
  }, [loading, runRequest]);

  return {
    messages,
    input,
    setInput,
    loading,
    error,
    canRetry,
    serverConfigured,
    send,
    retry,
    clear,
    scrollReason,
    acknowledgeScroll,
  };
}
