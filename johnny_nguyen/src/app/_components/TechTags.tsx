import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { PORTFOLIO, TECH_SERVICES } from "../PORTFOLIO";

const pill = "flex items-center rounded-full bg-teal-400/10 px-3 py-1 text-xs font-medium leading-5 text-teal-300";

// The services arrive as one group and leave as one, so the row is a single
// mount rather than seven — nothing reflows between the first pill and the last.
const group = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.035, delayChildren: 0.03 } },
  gone: { opacity: 0, transition: { duration: 0.12 } },
};

const service = {
  hidden: { opacity: 0, scale: 0.85, x: -10 },
  show: { opacity: 1, scale: 1, x: 0, transition: { type: 'spring' as const, stiffness: 520, damping: 32 } },
  gone: { opacity: 0, scale: 0.9, transition: { duration: 0.1 } },
};

function TechTags() {
  // One at a time. Hover sets it, tap toggles it — a phone never sends a hover,
  // so the tap is the only way in there.
  const [openTech, setOpenTech] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const openServices = openTech ? TECH_SERVICES[openTech] : undefined;

  return (
    // Leaving the block closes the group, which is what lets the pointer travel
    // down from the pill into the services without the row vanishing under it.
    <motion.div onHoverEnd={() => setOpenTech(null)}>
      <ul className="flex flex-wrap items-center gap-4">
        {PORTFOLIO.techs.map((tech) => {
          const services = TECH_SERVICES[tech];
          const open = openTech === tech;
          // While a group is unfurled the rest step back, the same way a hovered
          // timeline item dims its siblings.
          const dimmed = openTech !== null && !open;

          if (!services) {
            return (
              <motion.li
                key={tech}
                animate={{ opacity: dimmed ? 0.35 : 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                // Reaching a plain pill means you have moved on from the group.
                onHoverStart={() => setOpenTech(null)}
                className={pill}
              >
                {tech}
              </motion.li>
            );
          }

          return (
            <motion.li key={tech} onHoverStart={() => setOpenTech(tech)}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls="tech-services"
                aria-label={`${tech} — ${open ? 'hide' : 'show'} the services underneath`}
                onClick={() => setOpenTech(open ? null : tech)}
                onFocus={() => setOpenTech(tech)}
                onBlur={() => setOpenTech(null)}
                className={`${pill} cursor-pointer gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-300/60 ${open ? 'bg-teal-400/25' : ''}`}
              >
                {tech}
                {/* Static on purpose: a counter that resized itself would push
                    the pills beside it every time the group opened. */}
                <span className="tabular-nums opacity-60">+{services.length}</span>
              </button>
            </motion.li>
          );
        })}
      </ul>

      {/* The lane the services drop into. It is always this tall and its
          contents are absolute, so opening one costs the page no layout at all —
          nothing above shifts, and a group that wraps to two rows still doesn't. */}
      <div className="relative mt-3 h-8">
        <AnimatePresence mode="wait">
          {openServices && (
            <motion.ul
              key={openTech}
              id="tech-services"
              variants={group}
              initial={reduceMotion ? false : "hidden"}
              animate="show"
              exit="gone"
              className="absolute inset-x-0 top-0 flex flex-wrap items-center gap-2"
            >
              {openServices.map((name) => (
                <motion.li
                  key={name}
                  variants={reduceMotion ? undefined : service}
                  className="rounded-full bg-teal-400/5 px-2.5 py-1 text-[11px] font-medium leading-5 text-teal-300/70"
                >
                  {name}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default TechTags;
