/**
 * Parsing for /ask's slide protocol. Pure functions only — this module is
 * imported by both the API route and client components, so it must never
 * touch fs, env, or anything Node-only.
 */

export type SlideFormat = 'editorial' | 'list' | 'experience' | 'projects';

const TAGS: Record<string, SlideFormat> = {
  '[[SLIDE LIST]]': 'list',
  '[[SLIDE EXPERIENCE]]': 'experience',
  '[[SLIDE PROJECTS]]': 'projects',
};
const TAG_NAMES = Object.keys(TAGS);

export interface LeadingTagScan {
  /** null means "keep buffering — this could still become a tag". */
  format: SlideFormat | null;
  /** Once settled: the text after the tag line, or the whole buffer if no tag. */
  rest: string;
}

/**
 * Decides the slide format from the very start of the model's reply. Holding
 * tokens back delays the visitor's first word, so the buffer is held ONLY
 * while it is still a strict prefix of a known tag; anything else settles as
 * editorial immediately. An unknown or abandoned tag keeps its text — visible
 * words are never eaten by a parse that didn't work out.
 */
export function scanLeadingTag(buffer: string, streamDone: boolean): LeadingTagScan {
  for (const tag of TAG_NAMES) {
    if (buffer.startsWith(tag)) {
      // Skip a single newline after the tag; it frames the tag, not the body.
      let rest = buffer.slice(tag.length);
      if (rest.startsWith('\n')) rest = rest.slice(1);
      return { format: TAGS[tag], rest };
    }
  }

  const viable = TAG_NAMES.some((tag) => tag.startsWith(buffer));
  if (viable && buffer.length > 0 && !streamDone) return { format: null, rest: '' };

  return { format: 'editorial', rest: buffer };
}

/**
 * First non-empty line is the headline; every later non-empty line is an item,
 * with a leading list marker stripped. Never throws — a malformed body is just
 * a short slide.
 */
export function parseSlideBody(text: string): { headline: string; items: string[] } {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const [headline = '', ...others] = lines;
  const items = others.map((line) => line.replace(/^[-–—•]\s*/, ''));
  return { headline, items };
}
