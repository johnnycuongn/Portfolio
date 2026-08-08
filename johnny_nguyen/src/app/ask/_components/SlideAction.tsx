'use client';

import type { ChatAction } from '@/app/_ai/types';
import ContactSendButton from '@/app/_components/ContactSendButton';
import useResumeViewer from '@/utils/useResumeViewer';

/**
 * The row under a slide when the firefly attached something doable. Labels
 * come from PORTFOLIO via the route — never composed here.
 */
export default function SlideAction({ action }: { action?: ChatAction }) {
  const { open: openResume } = useResumeViewer();
  if (!action) return null;

  if (action.sends) return <ContactSendButton draft={action.sends} />;

  if (action.opens === 'resume') {
    return (
      <button
        type="button"
        onClick={openResume}
        className="mt-2 inline-block text-sm text-teal-300 transition-colors hover:underline"
      >
        {action.label} →
      </button>
    );
  }

  if (action.href) {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-sm text-teal-300 hover:underline"
      >
        {action.label} →
      </a>
    );
  }

  return null;
}
