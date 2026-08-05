import type { ChatMessage } from './types';
import { buildSystemPrompt } from './knowledge';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const MAX_OUTPUT_TOKENS = 300;

export class ProviderError extends Error {}

export function isProviderConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

/**
 * Groq speaks the OpenAI chat-completions dialect, so this is a plain fetch with
 * no SDK. Swapping providers means rewriting this file and nothing else.
 */
export async function* streamCompletion(
  history: ChatMessage[],
  signal: AbortSignal,
): AsyncGenerator<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new ProviderError('GROQ_API_KEY is not set');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.7,
      stream: true,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        ...history.map((message) => ({
          role: message.role === 'user' ? 'user' : 'assistant',
          content: message.text,
        })),
      ],
    }),
  });

  if (!response.ok || !response.body) {
    throw new ProviderError(`Groq responded ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // A partial JSON frame; the next chunk completes it.
      }
    }
  }
}
