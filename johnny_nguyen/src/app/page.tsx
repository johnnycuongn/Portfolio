'use client'

import { useRef, useState, useEffect } from "react";
import { PortfolioNavBar } from "./_components/main_navigations";

import { PORTFOLIO, PROFILE_LINKS, PROJECTS } from "./PORTFOLIO";

import { motion, useScroll, useTransform, useSpring, useMotionValue, color } from "motion/react";
import Timeline from "./_components/Timeline";
import PublicProfilesBar from "./_components/ProfilesLinkGroup";
import MouseAndCat from "./_components/MouseAndCat";
import ProjectCard from "./_components/ProjectCard";


const ScrollSections = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const section1Ref = useRef<HTMLDivElement>(null);
  const section2Ref = useRef<HTMLDivElement>(null);
  const section3Ref = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [section2Position, setSection2Position] = useState({ x: 0, y: 0 });
  
  const [section3Position, setSection3Position] = useState({ x: 0, y: 0 });

  const { scrollY } = useScroll();

  const y2 = useTransform(scrollY, [0, containerHeight], [0, -containerHeight]);
  const customY2 = useMotionValue(0);
  const springY2 = useSpring(customY2, { damping: 30, stiffness: 80 });

  const y3 = useTransform(scrollY, [containerHeight, containerHeight*2], [0, -containerHeight]);
  const customY3 = useMotionValue(0);
  const springY3 = useSpring(customY3, { damping: 30, stiffness: 80 });

  // Text animations
  const text1Opacity = useTransform(scrollY, [0, containerHeight / 2], [1, 0]);
  const text1Y = useTransform(scrollY, [0, containerHeight / 2], [0, -50]);

  const text2Opacity = useTransform(scrollY, [containerHeight / 2, containerHeight, containerHeight * 1.5], [0, 1, 0]);
  const text2Y = useTransform(scrollY, [containerHeight / 2, containerHeight], [-100, 0]);

  const text3Opacity = useTransform(scrollY, [containerHeight * 1.5, containerHeight * 2], [0, 1]);
  const text3Y = useTransform(scrollY, [containerHeight * 1.5, containerHeight * 2], [50, 0]);

  // Implement magnetic scroll for section 2
  useEffect(() => {
    return y2.on("change", (latest: number) => {
      if (latest > - 150) {
        customY2.set(0);
      }
      else if (latest > -containerHeight + 150) {
        // Regular scroll behavior when not close to snapping point
        customY2.set(latest);
       
      } else if (latest <= -containerHeight + 150) {
        // Snap to fully in view when very close
        customY2.set(-containerHeight);
      }
    });

  }, [y2, customY2, springY2, containerHeight]);
  
  // Implement magnetic scroll for section 3
  useEffect(() => {

    return y3.on("change", (latest: number) => {
      if (latest > - 150) {
        customY3.set(0);
      }
      else if (latest > -containerHeight + 150) {
        // Regular scroll behavior when not close to snapping point
        customY3.set(latest);
      } else if (latest <= -containerHeight + 150) {
        // Snap to fully in view when very close
        customY3.set(-containerHeight);
      }
    });

  }, [y3, customY3, springY3, containerHeight]);

  useEffect(() => {
    if (containerRef.current) {
      setContainerHeight( window.innerHeight);
    }
  }, []);

  useEffect(() => {
    let animationFrameId;

    const trackSectionsPosition = () => {
      if (section2Ref.current && section3Ref.current) {
        const rect = section2Ref.current.getBoundingClientRect();
        setSection2Position({ x: rect.left, y: rect.top });

        const rect3 = section3Ref.current.getBoundingClientRect();
        setSection3Position({ x: rect3.left, y: rect3.top });
      }
      animationFrameId = requestAnimationFrame(trackSectionsPosition);
    };

    trackSectionsPosition();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="h-[300vh] w-max-screen items-center justify-center">
      
      <PortfolioNavBar />
      {/* Section 1 */}
      <div ref={section1Ref} className="fixed top-0 left-0 w-full h-screen grid grid-cols-1 md:grid-cols-5  md:items-center md:justify-center p-4 text-white z-10">
        <div className="col-span-2 flex flex-col h-full justify-center md:py-16">
          <motion.div style={{ opacity: text1Opacity, y: text1Y }}>
            <h1 className="text-6xl pb-4">{PORTFOLIO.name}</h1>
            <div className="text-xl pb-4">{PORTFOLIO.role}</div>
            <PublicProfilesBar items={PROFILE_LINKS} />
          </motion.div>
        </div>
        <div className="md:col-span-3 flex flex-col f-full px-4">
          <motion.div style={{ opacity: text1Opacity, y: text1Y }}>
            <p>{PORTFOLIO.description}</p>
            <ul className="flex flex-wrap gap-4 text-xl mt-4">
                {PORTFOLIO.techs.map((tech) => (
                  <li key={tech} className="flex items-center rounded-full bg-teal-400/10 px-3 py-1 text-xs font-medium leading-5 text-teal-300 ">{tech}</li>
                ))}
            </ul>
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
            <span className="text-4xl py-4">Experience</span>
            <div className="flex h-full w-full">
              <Timeline />
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Section 3 */}
      <motion.div
        style={{ y: y3 }}
        className="fixed top-full left-0 w-full h-full p-4 z-30"
      >
        <div ref={section3Ref} className="h-full w-full flex flex-col text-white">
          <motion.div
            style={{ opacity: text3Opacity, y: text3Y }}
            className="h-full w-full flex flex-col justify-center"
          >
            <span className="text-4xl py-4">Projects</span>
            <div className="w-full h-full grid grid-flow-col grid-rows-2 md:grid-rows-4 gap-4">
               
              {/* Project 1 */}
              <ProjectCard index={0} projectId={PROJECTS[0].id} 
                className="md:col-span-2 md:row-span-2"
              />
              {/* Project 2 */}
              <ProjectCard index={1} projectId={PROJECTS[1].id}
                className="md:col-span-2 md:row-span-2"
              />
              {/* Project 3
              <ProjectCard index={2} projectId={PROJECTS[2].id}
                className="md:row-span-4"
              /> */}

            </div>

          </motion.div>
        
        </div>
      </motion.div>
    </div>

  );
};

export default function Home() {
  return (
    <div className="">
      <main className="bg-slate-900">
        <MouseAndCat />
        <ScrollSections />
      </main>
   
    </div>
  );
}
