'use client'

import { useRef, useState, useEffect } from "react";
import { PortfolioNavBar } from "./_components/main_navigations";
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "motion/react";

const ScrollSections = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const section1Ref = useRef<HTMLDivElement>(null);
  const section2Ref = useRef<HTMLDivElement>(null);
  const section3Ref = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [section2Position, setSection2Position] = useState({ x: 0, y: 0 });
  
  const [section3Position, setSection3Position] = useState({ x: 0, y: 0 });
  const { scrollY } = useScroll();

  const nameX = useTransform(scrollY, [0, 300], [0, -100]); // Move name to the left
  const newTextX = useTransform(scrollY, [0, 300], [100, 0]); // Move new text from right to center
  const newTextOpacity = useTransform(scrollY, [0, 300], [0, 1]); // Fade in new text

  const y2 = useTransform(scrollY, [0, containerHeight], [0, -containerHeight]);
  const customY2 = useMotionValue(0);
  const springY2 = useSpring(customY2, { damping: 30, stiffness: 80 });

  const y3 = useTransform(scrollY, [containerHeight*1.2, containerHeight * 2.2], [0, -containerHeight]);
  const customY3 = useMotionValue(0);
  const springY3 = useSpring(customY3, { damping: 30, stiffness: 80 });

  // Text animations
  const text1Opacity = useTransform(scrollY, [0, containerHeight / 2], [1, 0]);

  const text2Opacity = useTransform(scrollY, [containerHeight / 2, containerHeight, containerHeight * 1.5], [0, 1, 0]);
  const text2Y = useTransform(scrollY, [containerHeight / 2, containerHeight], [-100, 0]);

  const text3Opacity = useTransform(scrollY, [containerHeight * 1.5, containerHeight * 2], [0, 1]);
  const text3Y = useTransform(scrollY, [containerHeight * 1.5, containerHeight * 2], [50, 0]);

  useEffect(() => {

    return y2.on("change", (latest: number) => {
      if (latest > -containerHeight + 150) {
        // Regular scroll behavior when not close to snapping point
        customY2.set(latest);
      } else if (latest <= -containerHeight + 150) {
        // Snap to fully in view when very close
        customY2.set(-containerHeight);
      }
    });

  }, [y2, customY2, springY2, containerHeight]);
  
  useEffect(() => {

    return y3.on("change", (latest: number) => {
      if (latest > -containerHeight + 150) {
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
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      if (scrollPosition > containerHeight * 2) {
        window.scrollTo(0, containerHeight * 2);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [containerHeight]);

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
    <div ref={containerRef} className="h-[300vh]">
      <div ref={section1Ref} className="fixed top-0 left-0 w-full h-screen bg-blue-500 flex items-center justify-center text-white text-4xl z-10">
        
        <motion.div style={{ opacity: text1Opacity }}>
        <div className="flex items-center justify-between w-full px-20">
          <motion.div style={{ x: nameX }} className="text-4xl">
            Duc Cuong Nguyen
          </motion.div>
          <motion.div 
            style={{ x: newTextX, opacity: newTextOpacity }} 
            className="text-2xl"
          >
            Full Stack Developer
          </motion.div>
        </div>
        <div className="absolute bottom-20 left-0 w-full px-20">
          <div className="grid grid-cols-6 gap-4">
            <span className="text-sm">React</span>
            <span className="text-sm">React</span>
            <span className="text-sm">React</span>
            <span className="text-sm">React</span>
            <span className="text-sm">React</span>
          </div>
        </div>
        </motion.div>
      </div>
      <motion.div
        style={{ y: springY2 }}
        className="fixed top-full left-0 w-full h-screen bg-red-200 z-20"
      >
        <div ref={section2Ref} className="h-screen bg-green-500 flex items-center justify-center text-white text-4xl">
          <motion.div style={{ opacity: text2Opacity, y: text2Y }}>
            Section 2 (Scrollable)<br />
            X: {Math.round(section2Position.x)}, Y: {Math.round(section2Position.y)}
          </motion.div>
        </div>
      </motion.div>
      <motion.div
        style={{ y: springY3 }}
        transition={{ duration: 0.5 }}
        className="fixed top-full left-0 w-full h-screen bg-red-200 z-30"
      >
        <div ref={section3Ref} className="h-screen bg-red-500 flex items-center justify-center text-white text-4xl">
          <motion.div style={{ opacity: text3Opacity, y: text3Y }}>
            Section 3 (Scrollable)<br />
            X: {Math.round(section3Position.x)}, Y: {Math.round(section3Position.y)}
          </motion.div>
        
        </div>
      </motion.div>
    </div>
  );
};

export default function Home() {
  return (
    <div className="">
      <PortfolioNavBar />
      <main className="">
        {/* <div className="grid grid-cols-3 min-h-screen bg-blue-400">
          <div className="bg-red-100 flex flex-col items-center p-4">
            <p className="text-3xl">Duc Cuong Nguyen</p>
            <p>A full-stack software engineer with 2+ years of experience, who focuses on providing the most high-quality and usable solutions, specialising in React and Typescript. Aimed to deliver projects on time while implementing software engineering practices in the team. Seeking an opportunity for growth, leveraging my software development passion to contribute to high-impact projects.</p>
          </div>
          <div className="col-span-2 bg-gray-200"></div>
        </div> */}
        <ScrollSections />
      </main>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">
      </footer>
    </div>
  );
}
