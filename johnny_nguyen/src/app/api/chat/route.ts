import { matchFallback } from '../../_ai/fallback';
import { limiter } from '../../_ai/limits';
import type { ChatMessage } from '../../_ai/types';

// fs is used by the knowledge module in a later task, and Node is required for it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGE_CHARS = 500;
const MAX_HISTORY = 8;

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

  // Task 8 replaces this line with the model call, keeping the fallback as its failure path.
  return fallbackResponse(question);
}
