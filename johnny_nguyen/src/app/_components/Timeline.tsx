'use client'

import React, { FC, useEffect, useRef } from 'react';
import './Timeline.css';
import { JobTimeLineItem, TimelineData } from '../PORTFOLIO';

const TimelineItem: FC<JobTimeLineItem> = ({ year, title, company, content, link, stacks }) => (
  <li className='timeline-item'>
    <div className='item flex flex-col h-full gap-1 group transition-all lg:hover:!opacity-100 lg:group-hover:group-[.hovered]:opacity-50'>
      <a href={link} className="absolute inset-0" aria-label={`Link to ${title} project`}></a>
      <span className='text-sm text-gray-400'>{year}</span>
      <span className='title'>{title} • {company}</span>
      <div className='break-all flex-grow text-sm text-gray-400'>
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
);

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
