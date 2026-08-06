import React, { useState, useEffect, useRef, FC } from 'react';
import { AnimatePresence, motion, useAnimation, useReducedMotion } from 'motion/react';
import { TbCopy, TbCopyCheckFilled } from 'react-icons/tb';
import { PORTFOLIO, RESUME } from '../PORTFOLIO';
import useResumeViewer from '@/utils/useResumeViewer';

interface TabItemProps {
  item: string;
}

const TabItem: FC<TabItemProps> = ({ item }) => {
  const controls = useAnimation();
  const [isHovered, setIsHovered] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  useEffect(() => {
    controls.start({ y: [0, -5, 0], transition: { duration: 0.5 } });
    if (item === 'Home') {
      const interval = setInterval(() => {
        controls.start({
          x: [0, 8, 0],
          transition: { duration: 1 }
        });
      }, 5000);

      return () => clearInterval(interval);
    }
    if (item === 'Resume') {
      const interval = setInterval(() => {
        controls.start({
          x: [0, -8, 0],
          transition: { duration: 1 }
        });
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [controls, item]);

  const copyResetTimer = useRef<NodeJS.Timeout>(undefined);
  const collapseTimer = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => () => {
    clearTimeout(copyResetTimer.current);
    clearTimeout(collapseTimer.current);
  }, []);

  const { open: openResume } = useResumeViewer();
  const handleResumeClick = () => openResume();

  const handleContactClick = () => {
    navigator.clipboard?.writeText(PORTFOLIO.email).catch(() => {});
    setIsCopied(true)
    clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setIsCopied(false), 3000)
  };

  // Once revealed, the email sticks around after the cursor leaves so it stays
  // readable and copyable without having to keep the pointer on the button.
  const handleHoverStart = () => {
    clearTimeout(collapseTimer.current);
    setIsHovered(true)
    setShowEmail(true)
  };

  const handleHoverEnd = () => {
    setIsHovered(false)
    clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setShowEmail(false), 10000)
  };

  const target = showEmail ? PORTFOLIO.email : item;
  const [typed, setTyped] = useState(item);
  const prefersReducedMotion = useReducedMotion();

  // Typewriter: erase the old word a leading character at a time (so it wipes away
  // left to right), then type the new one in against the nav's right edge.
  useEffect(() => {
    if (typed === target) return;
    if (prefersReducedMotion) {
      setTyped(target);
      return;
    }
    const isTyping = target.startsWith(typed);
    const tick = setTimeout(
      () => setTyped(isTyping ? target.slice(0, typed.length + 1) : typed.slice(1)),
      isTyping ? 14 : 18
    );
    return () => clearTimeout(tick);
  }, [typed, target, prefersReducedMotion]);

  const isAnimating = typed !== target;
  const emailReady = showEmail && !isAnimating;


  return (
    // The click lives on the <li>, not the <button>: whileTap's scale moves the DOM out from
    // under a held cursor, so mousedown and mouseup land on different elements and the browser
    // dispatches `click` on their common ancestor. The <li> never transforms, so it always
    // catches it — including the click a focused button synthesises for Enter/Space.
    <li onClick={item === 'Resume' ? handleResumeClick : handleContactClick}>
      <motion.div
        className="bg-slate-900 text-white rounded select-none flex items-center group"
        whileHover={{ backgroundColor: "#4B5563" }}
        whileTap={{ scale: 0.95 }}
        animate={controls}
      >
        {item === 'Resume' ? (
          <button
            title={RESUME.navTitle}
            aria-haspopup="dialog"
            className="px-4 py-2 cursor-pointer"
          >
            {item}
          </button>
        ) : (
          <motion.button
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
            aria-label="Copy email address"
            title="Click to copy my email"
            className="px-4 py-2 cursor-pointer flex items-center gap-2 whitespace-nowrap"
          >
            {/* Grid stack: the invisible label keeps the button at least as wide as "Contact",
                so erasing never shrinks it out from under the cursor and cancels the hover. */}
            <span className="grid justify-items-end">
              <span aria-hidden className="col-start-1 row-start-1 invisible">{item}</span>
              <span className="col-start-1 row-start-1 flex items-center gap-[3px]">
                {/* The whole address flashes teal on copy — a 16px icon swap alone is easy to miss. */}
                <span className={`transition-colors duration-150 ${isCopied ? 'text-teal-300' : ''}`}>{typed}</span>
                {(isHovered || isAnimating) && (
                  <motion.span
                    aria-hidden
                    className="w-px h-[1.1em] bg-teal-300"
                    animate={{ opacity: isAnimating ? 1 : [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                )}
              </span>
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
              {/* isCopied too: clicking mid-typing should still confirm, not wait for the icon to arrive */}
              {(emailReady || isCopied) && (
                <motion.span
                  key={isCopied ? 'copied' : 'copy'}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: isCopied ? [1.5, 1] : 1 }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className={isCopied ? 'text-teal-300' : 'text-gray-400'}
                >
                  {isCopied ? <TbCopyCheckFilled /> : <TbCopy />}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </motion.div>
    </li>
  );
};

const NAV_ITEMS = ['Resume', 'Contact'];

function PortfolioNavBar() {
  return (
    <nav className="fixed top-0 right-0 p-2 z-50">
      <ul className="flex flex-row gap-2">
        {NAV_ITEMS.map((item) => (
          <TabItem key={item} item={item} />
        ))}
      </ul>
    </nav>
  );
}

export default PortfolioNavBar;