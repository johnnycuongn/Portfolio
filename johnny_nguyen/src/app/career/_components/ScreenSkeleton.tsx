/**
 * The placeholder every career screen shows while its data is in flight.
 *
 * One shape for all four screens rather than a bespoke skeleton per screen, and
 * that is deliberate. A skeleton that imitates its screen exactly has to be kept
 * in step with it forever, and the moment it drifts it starts lying about what is
 * coming — a table outline that resolves into a timeline is worse than a neutral
 * block, because it promised something specific. These blocks promise only
 * "content, shortly", which is the whole of what this state honestly knows.
 *
 * It renders no `<TopBar />` of its own: each route's `loading.tsx` puts the real
 * bar above this, so the nav stays put across the swap and the tab you just
 * clicked is already the active one before any data arrives.
 *
 * `motion-safe:` gates the pulse. A viewer who has asked their system for reduced
 * motion gets the same layout holding still — the blocks still say "loading" by
 * being blocks.
 */

/** Widths chosen to read as prose and data rather than as a grid of identical bars. */
const ROWS = ['w-full', 'w-full', 'w-[86%]'] as const;

export default function ScreenSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading"
      className="bg-ground px-4 py-6 text-ink sm:px-10 sm:py-[26px]"
    >
      <div className="motion-safe:animate-pulse">
        {/* The heading line: one solid block for a title, one lighter for its note. */}
        <div className="flex items-center gap-4">
          <div className="h-7 w-44 rounded-md bg-surface-2 sm:w-56" />
          <div className="h-7 w-24 rounded-md bg-surface sm:w-32" />
        </div>

        <div className="mt-6 space-y-3">
          {ROWS.map((width, i) => (
            <div key={i} className={`h-11 rounded-md bg-surface ${width}`} />
          ))}
        </div>
      </div>
    </main>
  );
}
