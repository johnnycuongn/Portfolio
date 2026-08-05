'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_HISTORY, MAX_MESSAGE_CHARS, type ChatMessage } from '../app/_ai/types';
import { CHAT } from '../app/PORTFOLIO';
import { clearChat, getBrowserStorage, loadChat, saveChat, type StorageLike } from './chatStorage';

export interface UseChat {
  messages: ChatMessage[];
  isStreaming: boolean;
  /** True once a restored or in-session conversation exists, so the greeting and chips step aside. */
  hasHistory: boolean;
  /** Returns false (and does nothing) if the message was rejected — empty, or already streaming. */
  send(text: string): boolean;
  clear(): void;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function useChat(): UseChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const storageRef = useRef<StorageLike | null>(null);
  const hydrated = useRef(false);
  /** Mirrors `messages` so `send` can read the latest history without depending on it. */
  const messagesRef = useRef<ChatMessage[]>([]);

  // Read storage after mount only — reading during render would desync SSR markup.
  useEffect(() => {
    storageRef.current = getBrowserStorage();
    const restored = loadChat(storageRef.current);
    if (restored.length > 0) setMessages(restored);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    if (!hydrated.current) return;
    // Skip writes while a reply is still streaming in — saving on every token
    // would leave a truncated mid-sentence reply in storage if the tab closes
    // mid-stream. `send`'s `finally` flips `isStreaming` back to false once the
    // turn is settled (success, offline, or fallback), which re-fires this
    // effect with the completed messages and persists them.
    if (isStreaming) return;
    saveChat(storageRef.current, messages);
  }, [messages, isStreaming]);

  // The async work that follows an accepted message. Split out from `send` so
  // `send` itself can stay synchronous and report acceptance immediately —
  // the caller needs that to know whether it's safe to clear the draft.
  const sendAccepted = useCallback(
    async (trimmed: string) => {
      const userMessage: ChatMessage = { id: newId(), role: 'user', text: trimmed };
      const replyId = newId();

      // Read from the ref, not from a state updater — an updater must stay pure.
      const history: ChatMessage[] = [...messagesRef.current, userMessage];
      setMessages([...history, { id: replyId, role: 'firefly', text: '' }]);
      setIsStreaming(true);

      const patchReply = (patch: Partial<ChatMessage>) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === replyId ? { ...m, ...patch } : m)),
        );
      };

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) }),
        });
        if (!response.body) throw new Error('no stream');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let reply = '';

        const consume = (line: string) => {
          if (!line.trim()) return;
          const event = JSON.parse(line) as {
            type: 'token' | 'done';
            text?: string;
            fallback?: boolean;
            action?: ChatMessage['action'] | null;
          };
          if (event.type === 'token' && event.text) {
            reply += event.text;
            patchReply({ text: reply });
          } else if (event.type === 'done') {
            patchReply({ fallback: event.fallback, action: event.action ?? undefined });
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

        if (!reply) patchReply({ text: CHAT.offlineMessage, fallback: true });
      } catch (err) {
        // The route never errors by design, so this is a genuinely offline client
        // (or a stream-parsing bug) — logged for diagnosis, but the visitor still
        // only ever sees the friendly offline message, never a raw error state.
        console.error('useChat: send failed', err);
        patchReply({ text: CHAT.offlineMessage, fallback: true });
      } finally {
        setIsStreaming(false);
      }
    },
    [],
  );

  // Synchronous gate: validates and, if accepted, kicks off `sendAccepted`
  // without awaiting it. The boolean return lets the caller know immediately
  // whether it's safe to clear a draft — a message typed mid-stream is
  // rejected here rather than silently discarded.
  const send = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!trimmed || isStreaming) return false;
      void sendAccepted(trimmed);
      return true;
    },
    [isStreaming, sendAccepted],
  );

  const clear = useCallback(() => {
    clearChat(storageRef.current);
    setMessages([]);
  }, []);

  return { messages, isStreaming, hasHistory: messages.length > 0, send, clear };
}
