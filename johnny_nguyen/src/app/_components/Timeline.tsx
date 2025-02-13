'use client'

import React, { FC, useEffect, useRef, useState } from 'react';
import { FiExternalLink } from "react-icons/fi";
import './Timeline.css';
import { JobTimeLineItem, TimelineData } from '../PORTFOLIO';
import { motion, useAnimation } from 'motion/react';

const useDelayedNavigation = (delay: number) => {
  const [navigating, setNavigating] = useState(false);
  const [, setDestination] = useState('');

  const navigate = (url: string) => {
    setNavigating(true);
    setDestination(url);
    setTimeout(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
      setNavigating(false);
    }, delay);
  };

  return { navigating, navigate };
};

const TimelineItem: FC<JobTimeLineItem> = ({ year, title, company, content, link, stacks }) => {
  const controls = useAnimation();
  const { navigating, navigate } = useDelayedNavigation(200); // 500ms delay

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (navigating) return;

    await controls.start({
      x: '100%',
      y: '-100%',
      opacity: 0,
      transition: { duration: 0.5 }
    });
    navigate(link);
    setTimeout(async () => {
      await controls.start({
        x: '0',
        y: '0',
        opacity: 1,
        transition: { duration: 0.5 }
      });
    }, 2000)
  };
  
  return (
  <li className='timeline-item'>
    <div className='item flex flex-col h-full gap-1 group/item transition-all lg:hover:!opacity-100 lg:group-hover:group-[.hovered]:opacity-50 lg:hover:shadow-lg'>
    <a href={link} onClick={handleClick} className="absolute inset-0" aria-label={`Link to ${title} project`}></a>
      <span className='text-sm text-gray-400'>{year}</span>
     
      <span className='title inline-flex items-center transition-all group-hover/item:text-teal-300'>
          {title} • {company}
          <motion.span 
            className='inline-block ml-2'
            animate={controls}
            initial={{ x: 0, y: 0, opacity: 1 }}
          >
            <FiExternalLink />
          </motion.span>
      </span>
      <div className='break-words transition-all flex-grow text-sm text-gray-400 group-hover/item:text-white'>
        {content}
      </div>
      <div className='flex flex-wrap gap-1'>
        {stacks.map((stack, index) => (
          <span key={index} className='flex items-center rounded-full bg-teal-400/10 px-3 py-1 text-xs font-medium leading-5 text-teal-300'>
            {stack}
          </span>
        ))}
      </div>
    </div>
  </li>
)};

const Timeline: FC = () => {
  const timelineRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const setEqualHeights = () => {
      if (!timelineRef.current) return;
      const items = timelineRef.current.querySelectorAll("li > div.item");
      let maxHeight = 0;
      items.forEach(item => {
        (item as HTMLElement).style.height = 'auto';
        maxHeight = Math.max(maxHeight, item.offsetHeight);
      });
      items.forEach(item => {
        (item as HTMLElement).style.height = `${maxHeight}px`;
      });
    };

    setEqualHeights();
    window.addEventListener('resize', setEqualHeights);

    const parent = timelineRef.current?.querySelector('ol.group');
    if (parent) {
      parent.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.timeline-item')) {
          parent.classList.add('hovered');
        }
      });
      parent.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.timeline-item')) {
          parent.classList.remove('hovered');
        }
      });
    }

    return () => window.removeEventListener('resize', setEqualHeights);
  }, []);

  return (
    <section className="timeline" ref={timelineRef}>
      <ol className='group'>
        {TimelineData.map((item, index) => (
          <TimelineItem key={index} {...item}/>
        ))}
      </ol>
    </section>
  );
};

export default Timeline;
