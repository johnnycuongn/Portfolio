import type { ChatMessage } from '../app/_ai/types';

export const CHAT_STORAGE_KEY = 'firefly-chat-v1';
export const MAX_STORED_MESSAGES = 20;

const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredChat {
  version: number;
  updatedAt: number;
  messages: ChatMessage[];
}

/** Safari private mode throws on access, so this is guarded rather than assumed. */
export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadChat(storage: StorageLike | null, now: number = Date.now()): ChatMessage[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredChat;
    if (parsed?.version !== VERSION) return [];
    if (!Array.isArray(parsed.messages)) return [];
    if (typeof parsed.updatedAt !== 'number') return [];
    if (now - parsed.updatedAt > MAX_AGE_MS) return [];

    return parsed.messages.slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

export function saveChat(
  storage: StorageLike | null,
  messages: ChatMessage[],
  now: number = Date.now(),
): void {
  if (!storage) return;
  try {
    const payload: StoredChat = {
      version: VERSION,
      updatedAt: now,
      messages: messages.slice(-MAX_STORED_MESSAGES),
    };
    storage.setItem(CHAT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage disabled. Losing history must never break the chat.
  }
}

export function clearChat(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(CHAT_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
