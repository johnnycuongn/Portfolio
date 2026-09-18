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
 *
 * On the admin tree that last line is a considered trade, not an oversight. These
 * pages show `CodeGate` with no bar above it when there is no session, and this
 * boundary cannot tell the difference — reading the cookie here would make it
 * dynamic and there would be nothing left to prefetch. So an unauthenticated cold
 * load of an admin URL does flash a bar above the gate for as long as the render
 * takes. That path costs someone typing the URL by hand, because the gate offers no
 * navigation to click; dropping the bar instead would blink it out on every
 * authenticated tab switch, which is the common path. Bar stays.
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
