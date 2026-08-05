import { matchFallback } from '../../_ai/fallback';
import { limiter } from '../../_ai/limits';
import { isProviderConfigured, streamCompletion } from '../../_ai/provider';
import type { ChatMessage } from '../../_ai/types';

// fs is used by the knowledge module in a later task, and Node is required for it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGE_CHARS = 500;
const MAX_HISTORY = 8;
const PROVIDER_TIMEOUT_MS = 15_000;

function ndjson(lines: object[]): Response {
  const body = lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function fallbackResponse(question: string): Response {
  const answer = matchFallback(question);
  return ndjson([
    { type: 'token', text: answer.answer },
    { type: 'done', fallback: true, action: answer.action ?? null },
  ]);
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Streams the model's reply as NDJSON. If the provider fails before producing
 * any text, the caller falls back. If it dies mid-sentence, keep what we have
 * and append a pointer rather than discarding a half-written answer.
 */
function modelResponse(history: ChatMessage[], question: string): Response {
  const encoder = new TextEncoder();
  const controllerAbort = new AbortController();
  const timeout = setTimeout(() => controllerAbort.abort(), PROVIDER_TIMEOUT_MS);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      let produced = false;

      try {
        for await (const text of streamCompletion(history, controllerAbort.signal)) {
          produced = true;
          write({ type: 'token', text });
        }
        write({ type: 'done', fallback: false, action: null });
      } catch {
        // Mid-sentence failures keep the partial answer and hand off; failures
        // before any token just deliver the canned answer on its own.
        const answer = matchFallback(question);
        const handoff = produced ? ' …lost my thread there. ' : '';
        write({ type: 'token', text: handoff + answer.answer });
        write({ type: 'done', fallback: true, action: answer.action ?? null });
      } finally {
        clearTimeout(timeout);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  let messages: ChatMessage[] = [];
  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    if (Array.isArray(body.messages)) messages = body.messages;
  } catch {
    // Fall through to the empty-history path below.
  }

  const history = messages
    .filter((m) => typeof m?.text === 'string' && (m.role === 'user' || m.role === 'firefly'))
    .slice(-MAX_HISTORY);

  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const question = (lastUser?.text ?? '').slice(0, MAX_MESSAGE_CHARS);

  if (!question.trim()) {
    return fallbackResponse('');
  }

  const verdict = limiter.check(clientIp(request));
  if (!verdict.allowed) {
    return fallbackResponse(question);
  }

  if (!isProviderConfigured()) {
    return fallbackResponse(question);
  }

  // Each message forwarded to the provider is capped independently — the
  // question above is already bounded, but full history entries were never
  // clamped before this route started sending them to a paid-token model.
  const boundedHistory = history.map((message) => ({
    ...message,
    text: message.text.slice(0, MAX_MESSAGE_CHARS),
  }));

  return modelResponse(boundedHistory, question);
}
