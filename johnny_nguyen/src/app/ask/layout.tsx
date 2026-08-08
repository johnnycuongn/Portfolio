import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Ask about Johnny',
  description: 'Ask anything about Duc (Johnny) Nguyen — answers render as slides.',
};

export default function AskLayout({ children }: { children: ReactNode }) {
  return children;
}
