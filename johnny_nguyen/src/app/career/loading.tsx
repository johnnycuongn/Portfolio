/**
 * Shown while this screen's data is in flight.
 *
 * The file existing at all is the point. Every career page is `force-dynamic`, and
 * Next prefetches a `<Link>` into a dynamic route only as far as its nearest
 * `loading.tsx` — with no boundary there is nothing to prefetch and nothing to show
 * early, so the router keeps the *previous* screen on screen for the whole server
 * render and the click looks ignored. With one, the swap happens immediately and
 * the data streams in behind it.
 *
 * `<TopBar />` is here rather than inherited because the career layout deliberately
 * does not render it (see `career/layout.tsx`). Repeating it keeps the navigation
 * fixed across the swap, so the tab you just clicked is already active.
 */

import ScreenSkeleton from '@/app/career/_components/ScreenSkeleton';
import TopBar from '@/app/career/_components/TopBar';

export default function Loading() {
  return (
    <>
      <TopBar />
      <ScreenSkeleton />
    </>
  );
}
