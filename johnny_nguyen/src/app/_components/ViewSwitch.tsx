'use client'

import { FC } from 'react';
import { motion } from 'motion/react';
import { ViewMode } from '@/utils/useViewMode';

interface ViewSwitchProps {
  mode: ViewMode;
  onToggle: () => void;
  reduceMotion: boolean;
}

const ViewSwitch: FC<ViewSwitchProps> = ({ mode, onToggle, reduceMotion }) => {
  const isRail = mode === 'rail';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isRail}
      onClick={onToggle}
      // WCAG 2.5.3: the visible word has to be part of the accessible name,
      // so voice control can act on what the user can read.
      aria-label={`Experience view: ${isRail ? 'RAIL' : 'LINE'}`}
      className="group flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
    >
      <span className="relative block h-[18px] w-8 rounded-full bg-white/15 transition-colors group-hover:bg-white/25">
        <motion.span
          className="absolute top-[2.5px] left-[2.5px] block h-[13px] w-[13px] rounded-full bg-teal-300"
          animate={{ x: isRail ? 14 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
      <span className="font-mono text-[10px] tracking-widest text-gray-400 transition-colors group-hover:text-teal-300">
        {isRail ? 'RAIL' : 'LINE'}
      </span>
    </button>
  );
};

export default ViewSwitch;
