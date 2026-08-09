'use client';

import { motion, useReducedMotion } from 'motion/react';

const GLOW =
  'radial-gradient(circle, rgba(230,255,150,1) 0%, rgba(230,255,150,0.8) 25%, rgba(230,255,150,0.4) 50%, rgba(230,255,150,0) 75%)';

/**
 * How fast the glow breathes — the firefly's only tell about what it's doing.
 * `thinking` is the quick flutter while a reply streams; `settled` is slower
 * than idle, the firefly resting now that the answer has landed.
 */
export type FireflyPace = 'idle' | 'thinking' | 'settled';

const PULSE_SECONDS: Record<FireflyPace, number> = {
  thinking: 0.7,
  idle: 2,
  settled: 3.6,
};

/** The site's firefly, reduced to its glow. Shared by the chat beacon and /ask. */
export default function FireflyDot({
  size = 8,
  pace = 'idle',
}: {
  size?: number;
  pace?: FireflyPace;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      animate={reduceMotion ? undefined : { scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
      // Keyed on the pace so a change actually takes: an infinite repeat that
      // is already running keeps its original duration when only `transition`
      // changes, which left the firefly fluttering after its answer had landed.
      key={pace}
      transition={
        reduceMotion
          ? undefined
          : { duration: PULSE_SECONDS[pace], ease: 'easeInOut', repeat: Infinity }
      }
      style={{
        display: 'block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#fddba3',
        backgroundImage: GLOW,
        boxShadow: '0 0 10px 5px rgba(230,255,150,0.3)',
      }}
    />
  );
}
