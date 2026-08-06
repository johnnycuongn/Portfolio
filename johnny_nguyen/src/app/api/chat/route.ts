import { matchFallback } from '../../_ai/fallback';
import { limiter } from '../../_ai/limits';
import { isProviderConfigured, streamCompletion } from '../../_ai/provider';
import { heldPrefixLength, splitSentinel } from '../../_ai/sentinel';
import {
  MAX_HISTORY,
  MAX_MESSAGE_CHARS,
  type ChatAction,
  type ChatMessage,
} from '../../_ai/types';
import { CHAT } from '../../PORTFOLIO';

// fs is used by the knowledge module in a later task, and Node is required for it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel's default Node function timeout can be shorter than PROVIDER_TIMEOUT_MS below;
// without this, the platform can kill the function before our own timeout fires, handing
// the visitor a dead stream instead of the canned answer this route exists to guarantee.
export const maxDuration = 30;

const PROVIDER_TIMEOUT_MS = 15_000;

const NDJSON_HEADERS = {
  'content-type': 'application/x-ndjson; charset=utf-8',
  'cache-control': 'no-store',
};

function ndjson(lines: object[]): Response {
  const body = lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
  return new Response(body, { status: 200, headers: NDJSON_HEADERS });
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
 * Labels come from PORTFOLIO.ts, never from the model — the model chooses
 * *whether* there is an action, never what the button says.
 */
function actionFor(command: ReturnType<typeof splitSentinel>['command']): ChatAction | null {
  if (!command) return null;
  if (command.kind === 'resume') return { label: CHAT.resumeLabel, opens: 'resume' };
  return { label: CHAT.sendLabel, sends: command.draft };
}

/**
 * Streams the model's reply as NDJSON. If the provider fails before producing
 * any text, the caller falls back. If it dies mid-sentence, keep what we have
 * and append a pointer rather than discarding a half-written answer. A stream
 * that ends "successfully" without ever yielding text is treated the same as
 * a failure — an empty bubble is exactly the kind of visible break this route
 * exists to avoid.
 */
function modelResponse(history: ChatMessage[], question: string): Response {
  const encoder = new TextEncoder();
  const controllerAbort = new AbortController();
  const timeout = setTimeout(() => controllerAbort.abort(), PROVIDER_TIMEOUT_MS);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A client disconnect mid-stream can leave the controller already
      // closed/errored; enqueue/close would then throw synchronously. That's
      // just the visitor going away, not a server error, so swallow it here
      // rather than let it escape as an unhandled rejection.
      const write = (event: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          // Controller already closed/errored — nothing left to write to.
        }
      };
      let produced = false;

      const sendFallback = (handoff: string) => {
        const answer = matchFallback(question);
        write({ type: 'token', text: handoff + answer.answer });
        write({ type: 'done', fallback: true, action: answer.action ?? null });
      };

      try {
        // Text the model has produced but that we are not ready to release: it
        // is either a sentinel or still a viable prefix of one. Everything
        // ahead of it has been written already and can never retroactively
        // become part of a sentinel, so this stays small.
        let pending = '';

        for await (const text of streamCompletion(history, controllerAbort.signal)) {
          if (!text) continue;
          pending += text;

          const held = heldPrefixLength(pending);
          const release = pending.slice(0, pending.length - held);
          pending = pending.slice(pending.length - held);

          if (release) {
            produced = true;
            write({ type: 'token', text: release });
          }
        }

        // Whatever is left is the sentinel, a partial one, or trailing
        // whitespace. Only now can it be parsed.
        const { visible, command } = splitSentinel(pending);
        if (visible) {
          produced = true;
          write({ type: 'token', text: visible });
        }

        // An action counts as output: a reply that is *only* a sentinel is a
        // successful turn, not the empty-bubble case the fallback exists for.
        if (produced || command) {
          write({ type: 'done', fallback: false, action: actionFor(command) });
        } else {
          sendFallback('');
        }
      } catch (err) {
        // Mid-sentence failures keep the partial answer and hand off; failures
        // before any token just deliver the canned answer on its own. The
        // visitor's experience never changes here — this is operator-facing
        // only, so a bad key/model/quota is diagnosable from Vercel logs.
        console.error('api/chat: provider stream failed', err);
        sendFallback(produced ? ' …lost my thread there. ' : '');
      } finally {
        clearTimeout(timeout);
        try {
          controller.close();
        } catch {
          // Already closed/errored (e.g. client disconnected) — fine to ignore.
        }
      }
    },
  });

  return new Response(stream, { status: 200, headers: NDJSON_HEADERS });
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
    // Operator-facing only — the visitor still gets the same canned answer
    // either way, but the cap that fired is otherwise invisible in the logs.
    console.error('api/chat: rate limited', verdict.reason);
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
