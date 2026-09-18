/**
 * The admin tree's layout.
 *
 * It adds nothing visual — the cream shell, the fonts and the chrome provider all
 * come from `/career/layout.tsx`, and the admin screens are the same screens with
 * `editable` flipped. What it does add is a second, louder `noindex`: the parent
 * already sets one, but this subtree is the editable half and is worth being
 * unambiguous about.
 *
 * The code gate is not here. It lives in each admin page, because the gate is a
 * whole screen and a layout that rendered it would also have to decide what to do
 * about the top bar above it.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ledger — editing',
  robots: { index: false, follow: false, nocache: true },
};

export default function CareerAdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
