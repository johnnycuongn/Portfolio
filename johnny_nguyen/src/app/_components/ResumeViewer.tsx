'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RESUME } from '../PORTFOLIO';
import { RESUME_PAGES } from '../_resume/pages';
import useFocusTrap from '@/utils/useFocusTrap';
import useResumeViewer from '@/utils/useResumeViewer';
import useIsDesktop from '@/utils/useIsDesktop';

export default function ResumeViewer() {
  const { isOpen, close } = useResumeViewer();
  const reduceMotion = useReducedMotion();

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const trapTab = useFocusTrap(dialogRef);

  // A page that will not load must not leave a blank white rectangle behind.
  // Reset on close so a transient failure does not stick for the session.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isOpen) setFailed(false);
  }, [isOpen]);

  const showFallback = failed || RESUME_PAGES.length === 0;

  // Below md: the page is already full width and pinch-zoom handles the rest,
  // so the toggle only exists on desktop — where fit-height is otherwise too
  // small to read comfortably.
  const isDesktop = useIsDesktop();
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    if (!isOpen) setZoomed(false);
  }, [isOpen]);

  const canZoom = isDesktop && !showFallback;

  // The ✕ and the download pill arrive a beat after the sheet lands, step back
  // while you read, and return the moment you move. The stepping back only
  // happens where there is a pointer to move: on a touch screen faded chrome
  // would never come back on its own.
  const [chromeVisible, setChromeVisible] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setChromeVisible(false);
      return;
    }

    const hasPointer = window.matchMedia('(hover: hover)').matches;
    let idle: NodeJS.Timeout | undefined;

    const wake = () => {
      setChromeVisible(true);
      if (!hasPointer) return;
      clearTimeout(idle);
      idle = setTimeout(() => setChromeVisible(false), 2500);
    };

    // Let the page land first.
    const entrance = setTimeout(wake, 380);

    window.addEventListener('pointermove', wake);
    window.addEventListener('focusin', wake);
    window.addEventListener('scroll', wake, { capture: true, passive: true });
    return () => {
      clearTimeout(entrance);
      clearTimeout(idle);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('focusin', wake);
      window.removeEventListener('scroll', wake, { capture: true });
    };
  }, [isOpen]);

  // Focus lands on the close button, and goes back to whatever opened the
  // viewer when it shuts — the nav button or the firefly's action.
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus({ preventScroll: true });
    } else {
      triggerRef.current?.focus({ preventScroll: true });
      triggerRef.current = null;
    }
  }, [isOpen]);

  // `overflow: hidden` alone is not enough: it stops a scrollbar or a click-drag,
  // but a wheel/trackpad gesture can still move `window.scrollY` on the document
  // underneath — the CSS only hides the scrollbar, it doesn't universally block
  // every input path that produces a scroll. Pinning the body in place with
  // `position: fixed` at its current offset is the one technique that holds
  // regardless of how the scroll was generated, which is why body-scroll-lock
  // libraries all converge on it. `top` carries the offset so the pin doesn't
  // itself jump the page, and closing restores the exact scrollY rather than
  // trusting the browser to have kept it.
  useEffect(() => {
    if (!isOpen) return;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      rootOverflow: root.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      root.style.overflow = previous.rootOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      trapTab(event);
    },
    [close, trapTab],
  );

  const total = RESUME_PAGES.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={RESUME.dialogLabel}
          onKeyDown={onKeyDown}
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{ overscrollBehavior: 'contain' }}
          className="fixed inset-0 z-[300] overflow-y-auto bg-slate-900/80 backdrop-blur-sm"
        >
          <div className="flex min-h-full items-start justify-center p-2 md:items-center md:p-6">
            {/* The sheet stops the click that would otherwise close the dialog. */}
            <motion.div
              onClick={(event) => {
                event.stopPropagation();
                if (canZoom) setZoomed((value) => !value);
              }}
              title={canZoom ? (zoomed ? RESUME.zoomOutLabel : RESUME.zoomInLabel) : undefined}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.94, rotate: -1.4 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, rotate: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
              transition={
                reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 300, damping: 26 }
              }
              style={{
                boxShadow: showFallback
                  ? 'none'
                  : '0 26px 64px rgba(0,0,0,0.65), 0 0 40px rgba(230,255,150,0.10)',
              }}
              className={`w-full space-y-3 md:w-auto ${
                canZoom ? (zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in') : ''
              }`}
            >
              {showFallback ? (
                <div className="rounded-2xl bg-slate-800 px-6 py-8 text-center">
                  <p className="text-sm leading-6 text-gray-300">{RESUME.errorMessage}</p>
                  <a
                    href={RESUME.pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block rounded-full bg-teal-400/10 px-4 py-2 text-xs text-teal-300 transition-colors hover:bg-teal-400/20"
                  >
                    {RESUME.downloadLabel}
                  </a>
                </div>
              ) : (
                RESUME_PAGES.map((page, index) => (
                  <Image
                    key={page.src}
                    src={page.src}
                    width={page.width}
                    height={page.height}
                    priority={index === 0}
                    onError={() => setFailed(true)}
                    alt={RESUME.pageAlt
                      .replace('{n}', String(index + 1))
                      .replace('{total}', String(total))}
                    className={`h-auto w-full bg-white ${
                      zoomed ? 'md:w-[min(92vw,820px)]' : 'md:h-[88dvh] md:w-auto'
                    }`}
                  />
                ))
              )}
            </motion.div>
          </div>

          {/* The controls arrive after the page has landed, not with it. */}
          <motion.button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label={RESUME.closeLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: chromeVisible ? 1 : 0 }}
            transition={{ duration: chromeVisible ? 0.3 : 0.5 }}
            className="fixed right-4 top-4 text-xl leading-none text-gray-400 transition-colors hover:text-teal-300"
          >
            ✕
          </motion.button>

          <motion.a
            href={RESUME.pdf}
            download
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0 }}
            animate={{ opacity: chromeVisible ? 1 : 0 }}
            transition={{ duration: chromeVisible ? 0.3 : 0.5 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-teal-400/30 bg-slate-900/90 px-4 py-2 text-xs text-teal-300 transition-colors hover:bg-teal-400/20 md:left-auto md:right-6 md:translate-x-0 md:border-transparent md:bg-teal-400/10"
          >
            ↓ {RESUME.downloadLabel}
          </motion.a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
