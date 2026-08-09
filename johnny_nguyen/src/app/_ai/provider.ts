import type { ChatMessage } from './types';
import { buildSystemPrompt, type PromptSurface } from './knowledge';

export class ProviderError extends Error {}

interface Provider {
  name: string;
  /** Env var holding the key. Absent means this provider is skipped entirely. */
  envKey: string;
  endpoint: string;
  model(): string;
  /**
   * Cap on output tokens. Not a stylistic limit — it is a correctness one, because
   * a reply cut off mid-sentence loses the trailing sentinel and the action with it.
   */
  maxOutputTokens: number;
}

/**
 * Tried in order. Gemini first: its free tier is measured in hundreds of
 * thousands of tokens per minute, against Groq's 12,000, and the whole system
 * prompt is re-sent on every message. Groq is the understudy for when Gemini is
 * down or its own quota runs out.
 *
 * Both speak the OpenAI chat-completions dialect, so one fetch and one SSE
 * parser serve both and adding a third provider is a table entry.
 */
const PROVIDERS: Provider[] = [
  {
    name: 'gemini',
    envKey: 'GEMINI_AI_API_KEY',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    // `-latest` rather than a pinned version on purpose: gemini-2.5-flash was
    // retired for new keys and started 404ing, and an alias that keeps working
    // is worth more here than a version that cannot drift.
    model: () => process.env.GEMINI_MODEL || 'gemini-flash-latest',
    // Gemini's flash models spend part of this budget on hidden reasoning that
    // never reaches the stream. At 300 the visible reply came back as twelve
    // tokens with finish_reason "length" — truncated immediately before the
    // sentinel, so the Send button silently never appeared. Measured: a contact
    // reply completes in ~48 visible tokens, but needs four figures of headroom
    // to get there.
    maxOutputTokens: 1500,
  },
  {
    name: 'groq',
    envKey: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    // Groq does no hidden reasoning, so this is the visible reply and 300 is
    // ample for the 60-word answers the prompt asks for.
    maxOutputTokens: 300,
  },
];

/** Names of the providers with a key present, in the order they'd be tried. */
export function configuredProviders(): string[] {
  return PROVIDERS.filter((p) => Boolean(process.env[p.envKey])).map((p) => p.name);
}

export function isProviderConfigured(): boolean {
  return configuredProviders().length > 0;
}

/** One provider's stream. A plain fetch and a hand-rolled SSE parse — no SDK. */
async function* streamFrom(
  provider: Provider,
  history: ChatMessage[],
  signal: AbortSignal,
  surface: PromptSurface,
): AsyncGenerator<string> {
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env[provider.envKey]}`,
    },
    body: JSON.stringify({
      model: provider.model(),
      max_tokens: provider.maxOutputTokens,
      temperature: 0.7,
      stream: true,
      messages: [
        { role: 'system', content: buildSystemPrompt(surface) },
        ...history.map((message) => ({
          role: message.role === 'user' ? 'user' : 'assistant',
          content: message.text,
        })),
      ],
    }),
  });

  if (!response.ok || !response.body) {
    throw new ProviderError(`${provider.name} responded ${response.status}`);
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

/**
 * Streams the first provider that works.
 *
 * Falling through is only safe before the first token: once text has reached the
 * visitor, restarting on another provider would rewrite what they are already
 * reading, so a mid-sentence failure propagates and `api/chat` keeps the partial
 * answer and appends its handoff. A stream that ends without ever yielding text
 * counts as a failure too — an empty bubble is the outcome this exists to avoid.
 *
 * The abort signal is the route's single deadline shared across the whole chain
 * rather than one budget per provider. The failure this chain exists for is a
 * quota 429, which comes back immediately and leaves the rest of the budget for
 * the understudy; a provider that hangs instead will eat the deadline, and the
 * route's canned fallback is what catches that.
 */
export async function* streamCompletion(
  history: ChatMessage[],
  signal: AbortSignal,
  surface: PromptSurface = 'chat',
): AsyncGenerator<string> {
  const available = PROVIDERS.filter((p) => Boolean(process.env[p.envKey]));
  if (available.length === 0) throw new ProviderError('no chat provider is configured');

  let lastError: unknown;

  for (const provider of available) {
    let produced = false;
    try {
      for await (const text of streamFrom(provider, history, signal, surface)) {
        produced = true;
        yield text;
      }
      if (produced) return;
      lastError = new ProviderError(`${provider.name} returned an empty stream`);
    } catch (err) {
      if (produced) throw err;
      // The route's deadline, not this provider's fault — a second attempt has
      // no time to finish either.
      if (signal.aborted) throw err;
      lastError = err;
    }
    // Operator-facing only. The visitor's experience is identical whichever
    // provider answered, so a silent failover is otherwise invisible in the logs.
    console.error(`_ai/provider: ${provider.name} produced nothing, trying next`, lastError);
  }

  throw lastError ?? new ProviderError('every provider failed');
}
