'use client';

import { motion, useReducedMotion } from 'motion/react';

const GLOW =
  'radial-gradient(circle, rgba(230,255,150,1) 0%, rgba(230,255,150,0.8) 25%, rgba(230,255,150,0.4) 50%, rgba(230,255,150,0) 75%)';

/** The site's firefly, reduced to its glow. Shared by the chat beacon and /ask. */
export default function FireflyDot({ size = 8, fast = false }: { size?: number; fast?: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      animate={reduceMotion ? undefined : { scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
      transition={reduceMotion ? undefined : { duration: fast ? 0.7 : 2, ease: 'easeInOut', repeat: Infinity }}
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
