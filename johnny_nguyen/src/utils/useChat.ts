'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../app/_ai/types';
import { clearChat, getBrowserStorage, loadChat, saveChat, type StorageLike } from './chatStorage';

const MAX_MESSAGE_CHARS = 500;
const OFFLINE_MESSAGE =
  "Can't reach my brain from here. Johnny's inbox always works though — cuongdn2001@gmail.com.";

export interface UseChat {
  messages: ChatMessage[];
  isStreaming: boolean;
  /** True once a restored or in-session conversation exists, so the greeting and chips step aside. */
  hasHistory: boolean;
  send(text: string): Promise<void>;
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
    saveChat(storageRef.current, messages);
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!trimmed || isStreaming) return;

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
          body: JSON.stringify({ messages: history.slice(-8) }),
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

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) consume(line);
        }
        if (buffer.trim()) consume(buffer);

        if (!reply) patchReply({ text: OFFLINE_MESSAGE, fallback: true });
      } catch {
        // The route never errors by design, so this is a genuinely offline client.
        patchReply({ text: OFFLINE_MESSAGE, fallback: true });
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming],
  );

  const clear = useCallback(() => {
    clearChat(storageRef.current);
    setMessages([]);
  }, []);

  return { messages, isStreaming, hasHistory: messages.length > 0, send, clear };
}
