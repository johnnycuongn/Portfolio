import type { ChatAction } from './types';
import { PORTFOLIO, TimelineData, PROJECTS } from '../PORTFOLIO';

export interface FallbackAnswer {
  id: string;
  /** Lowercase words or phrases. Matched as whole words against the question. */
  triggers: string[];
  answer: string;
  action?: ChatAction;
}

const current = TimelineData[0];
const projectTitles = PROJECTS.map((p) => p.title);

/** Convert a number to English words for small counts (1-9+). */
function numberToWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  return n < words.length ? words[n] : String(n);
}

const emailAction: ChatAction = { label: 'Email Johnny', href: `mailto:${PORTFOLIO.email}` };

export const FALLBACK_ANSWERS: FallbackAnswer[] = [
  {
    id: 'who',
    triggers: ['who', 'about him', 'about johnny', 'introduce', 'himself'],
    answer: `Johnny's a ${PORTFOLIO.role.toLowerCase()} — ${PORTFOLIO.description.toLowerCase()}. He's been building things professionally since 2022, mostly across the stack. What would you like to know?`,
  },
  {
    id: 'now',
    triggers: ['now', 'currently', 'current', 'imsx', 'these days', 'working on', 'latest'],
    answer: `He's at ${current.company} as a ${current.title.toLowerCase()} — enterprise systems, invoicing and auditing workflows, plus the AWS side and the deploy pipelines. Want the detail on any of it?`,
    action: { label: current.company, href: current.link },
  },
  {
    id: 'stack',
    triggers: ['stack', 'tech', 'technologies', 'technology', 'languages', 'tools', 'typescript', 'aws', 'skills'],
    answer: `Mostly ${PORTFOLIO.techs.slice(0, 4).join(', ')} these days, with ${PORTFOLIO.techs.slice(4).join(' and ')} underneath. He's worked in React, Angular, .NET and Django too, so he picks up whatever the job needs.`,
  },
  {
    id: 'experience',
    triggers: ['experience', 'roles', 'jobs', 'job', 'worked', 'background', 'career', 'history'],
    answer: `${numberToWord(TimelineData.length).charAt(0).toUpperCase() + numberToWord(TimelineData.length).slice(1)} roles so far — ${TimelineData.map((j) => j.company).join(', ')}. Everything from water-quality monitoring for river rangers to enterprise invoicing systems. Ask about any one of them.`,
  },
  {
    id: 'projects',
    triggers: ['projects', 'project', 'side project', 'side projects', 'built', 'github', 'portfolio'],
    answer: `A few — ${projectTitles.slice(0, 2).join(' and ')}, among others. They're all on his GitHub if you want to poke around the code.`,
    action: { label: 'GitHub', href: 'https://github.com/johnnycuongn' },
  },
  {
    id: 'resume',
    triggers: ['resume', 'resumes', 'cv', 'pdf', 'download'],
    answer: 'Full resume is one click away.',
    action: { label: 'Open resume', href: PORTFOLIO.resume_link },
  },
  {
    id: 'contact',
    triggers: ['contact', 'email', 'reach', 'hire', 'hiring', 'linkedin', 'get in touch', 'talk to him'],
    answer: `Easiest is email — ${PORTFOLIO.email}. He's on LinkedIn too, and he does actually reply.`,
    action: emailAction,
  },
  {
    id: 'looking',
    triggers: ['looking for', 'available', 'availability', 'open to', 'opportunities', 'next role', 'looking'],
    answer: `He's happiest on product work where he owns a feature end to end. If you've got something in mind, email him at ${PORTFOLIO.email} — that's the fastest route.`,
    action: emailAction,
  },
];

export const CATCH_ALL: FallbackAnswer = {
  id: 'catch-all',
  triggers: [],
  answer: `That one's beyond my glow, honestly. Worth asking Johnny directly — ${PORTFOLIO.email}.`,
  action: emailAction,
};

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/**
 * Keyword-overlap scoring. Longer trigger phrases outweigh single words, so
 * "looking for" beats a stray "for". Below one match, returns the catch-all.
 */
export function matchFallback(question: string): FallbackAnswer {
  const haystack = normalize(question);
  let best: FallbackAnswer | null = null;
  let bestScore = 0;

  for (const entry of FALLBACK_ANSWERS) {
    let score = 0;
    for (const trigger of entry.triggers) {
      if (haystack.includes(` ${trigger} `)) {
        score += trigger.split(' ').length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return best && bestScore > 0 ? best : CATCH_ALL;
}
