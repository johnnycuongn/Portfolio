'use client'

import { useRef, useState, useEffect, useCallback } from "react";
import PortfolioNavBar from "./_components/main_navigations";

import { PORTFOLIO, PROFILE_LINKS } from "./PORTFOLIO";

import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import Timeline from "./_components/Timeline";
import PublicProfilesBar from "./_components/ProfilesLinkGroup";
import MouseAndCat from "./_components/MouseAndCat";
import ProjectRail from "./_components/ProjectRail";
import FireflyChat from "./_components/FireflyChat";


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
  const [containerHeight, setContainerHeight] = useState(0);
  const reduceMotion = useReducedMotion();

  const { scrollY } = useScroll();

  const y2 = useTransform(scrollY, [0, containerHeight], [0, -containerHeight]);

  const y3 = useTransform(scrollY, [containerHeight, containerHeight*2], [0, -containerHeight]);

  // Text animations
  const text1Opacity = useTransform(scrollY, [0, containerHeight / 2], [1, 0]);
  const text1Y = useTransform(scrollY, [0, containerHeight / 2], [0, -50]);

  const text2Opacity = useTransform(scrollY, [containerHeight / 2, containerHeight, containerHeight * 1.5], [0, 1, 0]);
  const text2Y = useTransform(scrollY, [containerHeight / 2, containerHeight], [-100, 0]);

  const text3Opacity = useTransform(scrollY, [containerHeight * 1.5, containerHeight * 2], [0, 1]);
  const text3Y = useTransform(scrollY, [containerHeight * 1.5, containerHeight * 2], [50, 0]);


  const scrollToSection = useCallback((sectionNumber: number) => {
    window.scrollTo({
      top: containerHeight * (sectionNumber - 1),
      behavior: 'smooth'
    });
  }, [containerHeight]);

  useEffect(() => {
    setContainerHeight(window.innerHeight);
  }, []);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (containerHeight === 0) return;

    const handleScroll = () => {
      clearTimeout(timeoutId);

      timeoutId = setTimeout(() => {
        const scrollPosition = window.scrollY;
        const sectionNumber = Math.round(scrollPosition / containerHeight) + 1;
        scrollToSection(sectionNumber);
      }, 100); // Adjust this delay as needed
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [containerHeight, scrollToSection])

  return (
    <div ref={containerRef} className="h-[300vh] w-full">
      
      <PortfolioNavBar />
      {/* Section 1 */}
      <div ref={section1Ref} className="fixed top-0 left-0 w-full h-screen grid grid-cols-1 md:grid-cols-5  md:items-center md:justify-center p-4 text-white z-10">
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
        className="fixed top-full left-0 w-full h-full p-4 z-20"
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
        className="fixed top-full left-0 w-full h-full flex flex-col p-4 z-30"
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
    <div className="">
      <main className="bg-slate-900">
        <MouseAndCat />
        <FireflyChat />
        <MainSections />
      </main>
   
    </div>
  );
}
