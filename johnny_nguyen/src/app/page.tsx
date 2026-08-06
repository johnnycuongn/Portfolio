'use client'

import { useRef, useState, useEffect } from "react";
import PortfolioNavBar from "./_components/main_navigations";

import { PORTFOLIO, PROFILE_LINKS } from "./PORTFOLIO";

import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import Timeline from "./_components/Timeline";
import PublicProfilesBar from "./_components/ProfilesLinkGroup";
import MouseAndCat from "./_components/MouseAndCat";
import ProjectRail from "./_components/ProjectRail";
import FireflyChat from "./_components/FireflyChat";
import useKeyboardInset from "@/utils/useKeyboardInset";
import ResumeViewer from "./_components/ResumeViewer";
import useResumeViewer, { ResumeViewerProvider } from "@/utils/useResumeViewer";


// Hero, Experience, Projects. The container is this many viewports tall and the
// snap divides by it — the three move together.
const SECTION_COUNT = 3;

const heroStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } }
};

const heroStaggerDelayed = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.25 } }
};

const heroItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

const MainSections = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const section1Ref = useRef<HTMLDivElement>(null);
  const section2Ref = useRef<HTMLDivElement>(null);
  const section3Ref = useRef<HTMLDivElement>(null);
  const [sectionHeight, setSectionHeight] = useState(0);
  // The act the page is parked on. A settle may move this by one at most —
  // see the clamp in `snap`.
  const parkedRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const { inset: keyboardInset } = useKeyboardInset();
  const { isOpen: resumeOpen } = useResumeViewer();

  const { scrollY } = useScroll();

  const y2 = useTransform(scrollY, [0, sectionHeight], [0, -sectionHeight]);

  const y3 = useTransform(scrollY, [sectionHeight, sectionHeight*2], [0, -sectionHeight]);

  // Text animations
  const text1Opacity = useTransform(scrollY, [0, sectionHeight / 2], [1, 0]);
  const text1Y = useTransform(scrollY, [0, sectionHeight / 2], [0, -50]);

  const text2Opacity = useTransform(scrollY, [sectionHeight / 2, sectionHeight, sectionHeight * 1.5], [0, 1, 0]);
  const text2Y = useTransform(scrollY, [sectionHeight / 2, sectionHeight], [-100, 0]);

  const text3Opacity = useTransform(scrollY, [sectionHeight * 1.5, sectionHeight * 2], [0, 1]);
  const text3Y = useTransform(scrollY, [sectionHeight * 1.5, sectionHeight * 2], [50, 0]);

  // Measure the container rather than asking the window: the container is
  // exactly three sections tall, so a third of it is a section by construction
  // and cannot drift from what CSS actually laid out. `window.innerHeight` can
  // and does — a mobile URL bar sliding away changes it while leaving `vh`, and
  // so the layout, untouched. Reading it once at mount then snapping against it
  // is what drags the sections off their marks by the height of that bar.
  useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      if (container) setSectionHeight(container.getBoundingClientRect().height / 3);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (sectionHeight === 0) return;

    // Resync to wherever the page actually is: a reload can restore a scroll
    // position, and this effect re-runs whenever the geometry or the keyboard
    // changes. Without this the clamp below would measure from a stale act.
    parkedRef.current = Math.round(window.scrollY / sectionHeight);

    let timeoutId: NodeJS.Timeout;
    // A touch scroll hands off to momentum the browser owns. Firing a smooth
    // scroll into that inertia makes the two fight — the stutter phones see —
    // so hold off until the finger has left and the page has coasted to a stop.
    let touching = false;

    const snap = () => {
      if (touching) return;
      // An open keyboard means the chat is open over the page, and that opening
      // it can itself scroll the page. Hauling the page to a section boundary
      // out from under someone mid-sentence is motion nobody asked for.
      if (keyboardInset > 0) return;

      // The resume viewer parks the page under a scrim. Locking the body stops
      // most scrolling, but iOS can still coast, and snapping the page under an
      // open dialog would move it out from under the reader.
      if (resumeOpen) return;

      // A flick carries the page under its own momentum, and by the time it has
      // coasted to a stop it can be a whole act past where it started. Rounding
      // to the nearest act then honours the overshoot, and Experience — being
      // the middle act — is the only one that can be passed over entirely, in
      // either direction. So a settle advances by one act at most: the page
      // catches you at each in turn, and reaching Projects from the hero is two
      // gestures rather than one hard flick.
      const parked = parkedRef.current;
      const nearest = Math.round(window.scrollY / sectionHeight);
      const index = Math.min(Math.max(nearest, parked - 1), parked + 1);
      const act = Math.min(Math.max(index, 0), SECTION_COUNT - 1);
      parkedRef.current = act;

      const target = sectionHeight * act;
      // Arriving fires more scroll events. Without this the page schedules yet
      // another scroll to the spot it is already sitting on, which on iOS lands
      // in the middle of the next gesture.
      if (Math.abs(window.scrollY - target) < 1) return;
      window.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
    };

    const settle = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(snap, 120);
    };

    const onTouchStart = () => {
      touching = true;
      clearTimeout(timeoutId);
    };

    const onTouchEnd = () => {
      touching = false;
      settle();
    };

    window.addEventListener('scroll', settle, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    // The geometry can change under a page that is standing still — a rotation,
    // or a keyboard folding away after it pushed things around. Both leave the
    // acts resting half-and-half with no scroll event coming to tidy them up.
    settle();

    return () => {
      window.removeEventListener('scroll', settle);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      clearTimeout(timeoutId);
    };
  }, [sectionHeight, reduceMotion, keyboardInset, resumeOpen])

  return (
    // Two viewport units, on purpose. `vh` is the one a mobile URL bar cannot
    // move, so it owns the scroll distance and where each act is parked — the
    // numbers the snap has to agree with. The acts themselves are sized in
    // `svh`, the height that is on screen even with the bar showing, so a
    // section is never taller than the window it has to fit in.
    <div ref={containerRef} className="h-[300vh] w-full">

      <PortfolioNavBar />
      {/* Section 1 */}
      <div ref={section1Ref} className="fixed top-0 left-0 w-full h-[100svh] grid grid-cols-1 md:grid-cols-5  md:items-center md:justify-center p-4 text-white z-10">
        <div className="col-span-2 flex flex-col h-full justify-center md:py-16">
          <motion.div
            style={{ opacity: text1Opacity, y: text1Y }}
            variants={heroStagger}
            initial={reduceMotion ? false : "hidden"}
            animate="show"
          >
            <motion.h1 variants={heroItem} className="text-6xl tracking-tight pb-4">{PORTFOLIO.name}</motion.h1>
            <motion.div variants={heroItem} className="text-xl pb-4">{PORTFOLIO.role}</motion.div>
            <motion.div variants={heroItem}>
              <PublicProfilesBar items={PROFILE_LINKS} />
            </motion.div>
          </motion.div>
        </div>
        <div className="md:col-span-3 flex flex-col px-4">
          <motion.div
            style={{ opacity: text1Opacity, y: text1Y }}
            variants={heroStaggerDelayed}
            initial={reduceMotion ? false : "hidden"}
            animate="show"
          >
            <motion.p variants={heroItem} className="text-base md:text-lg leading-8">{PORTFOLIO.description}</motion.p>
            <motion.ul variants={heroItem} className="flex flex-wrap gap-4 text-xl mt-4">
                {PORTFOLIO.techs.map((tech) => (
                  <li key={tech} className="flex items-center rounded-full bg-teal-400/10 px-3 py-1 text-xs font-medium leading-5 text-teal-300 ">{tech}</li>
                ))}
            </motion.ul>
          </motion.div>
        </div>
      </div>
      {/* Section 2 */}
      <motion.div
        style={{ y: y2 }}
        className="fixed top-[100vh] left-0 w-full h-[100svh] p-4 z-20"
      >
        <div ref={section2Ref} className="h-full w-full text-white">
          <motion.div style={{ opacity: text2Opacity, y: text2Y }}
            className="h-full w-full flex flex-col justify-center"
          >
            <div className="min-h-0 flex-1">
              <Timeline />
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Section 3 */}
      <motion.div
        style={{ y: y3 }}
        className="fixed top-[100vh] left-0 w-full h-[100svh] flex flex-col p-4 z-30"
      >
        <div ref={section3Ref} className="grow h-full w-full flex flex-col text-white">
          <motion.div
            style={{ opacity: text3Opacity, y: text3Y }}
            className="h-full w-full flex flex-col justify-center"
          >
            <h2 className="text-4xl tracking-tight shrink-0 py-4">Projects</h2>
            <div className="min-h-0 flex-1">
              <ProjectRail />
            </div>

          </motion.div>
        </div>
        <footer className="grow-0 text-center min-h-24 w-full pt-4 pb-8 text-gray-400">
          <p>
            Made with <a href="https://nextjs.org/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">Next.js</a> and <a href="https://www.framer.com/motion/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">Framer Motion</a>. Hosted on <a href="https://vercel.com/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">Vercel</a>.
          </p>
          <p className="mt-2">
            © {new Date().getFullYear()} Duc Nguyen. All rights reserved.
          </p>
        </footer>
      </motion.div>
    </div>

  );
};

export default function Home() {
  return (
    <ResumeViewerProvider>
      <HomeShell />
    </ResumeViewerProvider>
  );
}

// The viewer sits outside <main> so that marking the page inert — which is what
// keeps a screen reader out of the dimmed page behind — cannot reach the dialog
// itself. React 19 takes `inert` as a plain boolean prop.
function HomeShell() {
  const { isOpen } = useResumeViewer();
  return (
    <div className="">
      <main className="bg-slate-900" inert={isOpen}>
        <MouseAndCat />
        <FireflyChat />
        <MainSections />
      </main>
      <ResumeViewer />
    </div>
  );
}
