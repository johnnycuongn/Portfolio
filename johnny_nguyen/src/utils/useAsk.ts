'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_MESSAGE_CHARS, type ChatAction, type ChatMessage } from '../app/_ai/types';
import type { SlideFormat } from '../app/_ai/slides';
import { CHAT } from '../app/PORTFOLIO';
import { getBrowserStorage, type StorageLike } from './chatStorage';
import { clearAsk, loadAsk, newSessionId, saveAsk, type AskTurn } from './askStorage';

/** When the model forgot its recap, this much of the raw answer stands in. */
const RECAP_FALLBACK_CHARS = 200;

export interface LiveSlide {
  question: string;
  format: SlideFormat;
  text: string;
  done: boolean;
  action?: ChatAction;
  fallback?: boolean;
}

export interface UseAsk {
  turns: AskTurn[];
  current: LiveSlide | null;
  isStreaming: boolean;
  send(text: string): boolean;
  clear(): void;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Past turns go to the model as recaps, not full answers — the token bill for
 * a long conversation stays flat. Only the latest settled answer travels in
 * full, so "tell me more about that" still has something to point at.
 */
export function compressHistory(turns: AskTurn[], question: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  turns.forEach((turn, index) => {
    const isLatest = index === turns.length - 1;
    const summary = turn.recap ?? turn.answer.slice(0, RECAP_FALLBACK_CHARS);
    messages.push({ id: `${turn.id}-q`, role: 'user', text: turn.question });
    messages.push({ id: `${turn.id}-a`, role: 'firefly', text: isLatest ? turn.answer : summary });
  });
  messages.push({ id: newId(), role: 'user', text: question });
  return messages;
}

export default function useAsk(): UseAsk {
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [current, setCurrent] = useState<LiveSlide | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const storageRef = useRef<StorageLike | null>(null);
  const sessionIdRef = useRef<string>('');
  const hydrated = useRef(false);
  const turnsRef = useRef<AskTurn[]>([]);

  // Read storage after mount only — reading during render would desync SSR markup.
  useEffect(() => {
    storageRef.current = getBrowserStorage();
    const restored = loadAsk(storageRef.current);
    sessionIdRef.current = restored.sessionId;
    if (restored.turns.length > 0) {
      setTurns(restored.turns);
      const last = restored.turns[restored.turns.length - 1];
      setCurrent({
        question: last.question,
        format: last.format,
        text: last.answer,
        done: true,
        action: last.action,
        fallback: last.fallback,
      });
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    turnsRef.current = turns;
    if (!hydrated.current) return;
    // Written only when settled — `send` appends the finished turn, so unlike
    // useChat there is no mid-stream state to skip here.
    saveAsk(storageRef.current, sessionIdRef.current, turns);
  }, [turns]);

  const sendAccepted = useCallback(async (question: string) => {
    setCurrent({ question, format: 'editorial', text: '', done: false });
    setIsStreaming(true);

    let format: SlideFormat = 'editorial';
    let text = '';
    let action: ChatAction | undefined;
    let fallback: boolean | undefined;
    let recap: string | null = null;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: compressHistory(turnsRef.current, question),
          surface: 'ask',
          sessionId: sessionIdRef.current,
        }),
      });
      if (!response.body) throw new Error('no stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as {
          type: 'format' | 'token' | 'done';
          format?: SlideFormat;
          text?: string;
          fallback?: boolean;
          action?: ChatAction | null;
          recap?: string | null;
        };
        if (event.type === 'format' && event.format) {
          format = event.format;
          setCurrent((prev) => (prev ? { ...prev, format: event.format! } : prev));
        } else if (event.type === 'token' && event.text) {
          text += event.text;
          setCurrent((prev) => (prev ? { ...prev, text } : prev));
        } else if (event.type === 'done') {
          action = event.action ?? undefined;
          fallback = event.fallback;
          recap = event.recap ?? null;
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) consume(line);
        }
        if (buffer.trim()) consume(buffer);
      } finally {
        reader.releaseLock();
      }

      if (!text && !action) {
        text = CHAT.offlineMessage;
        fallback = true;
      }
    } catch (err) {
      // The route never errors by design, so this is a genuinely offline client.
      console.error('useAsk: send failed', err);
      text = CHAT.offlineMessage;
      fallback = true;
    } finally {
      setCurrent({ question, format, text, done: true, action, fallback });
      setTurns((prev) => [
        ...prev,
        { id: newId(), question, answer: text, recap, format, action, fallback },
      ]);
      setIsStreaming(false);
    }
  }, []);

  const send = useCallback(
    (raw: string): boolean => {
      const trimmed = raw.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!trimmed || isStreaming) return false;
      void sendAccepted(trimmed);
      return true;
    },
    [isStreaming, sendAccepted],
  );

  const clear = useCallback(() => {
    clearAsk(storageRef.current);
    sessionIdRef.current = newSessionId();
    setTurns([]);
    setCurrent(null);
  }, []);

  return { turns, current, isStreaming, send, clear };
}
