import React, { useEffect, useRef } from 'react';
import './Timeline.css'; // Make sure to copy the CSS into this file

const TimelineItem = ({ year, content }) => (
  <li>
    <div>
      <time>{year}</time>
      {content}
    </div>
  </li>
);

const Timeline = () => {
  const timelineRef = useRef(null);

  useEffect(() => {
    const setEqualHeights = () => {
      const items = timelineRef.current.querySelectorAll("li > div");
      let maxHeight = 0;
      items.forEach(item => {
        item.style.height = 'auto';
        maxHeight = Math.max(maxHeight, item.offsetHeight);
      });
      items.forEach(item => {
        item.style.height = `${maxHeight}px`;
      });
    };

    setEqualHeights();
    window.addEventListener('resize', setEqualHeights);

    return () => window.removeEventListener('resize', setEqualHeights);
  }, []);

  const timelineData = [
    { year: 1934, content: "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium At vero eos et accusamus et iusto odio dignissimos." },
    { year: 1937, content: "Proin quam velit, efficitur vel neque vitae, rhoncus commodo mi. Suspendisse finibus mauris et bibendum molestie. Aenean ex augue, varius et pulvinar in, pretium non nisi." },
    { year: 1937, content: "Proin quam velit, efficitur vel neque vitae, rhoncus commodo mi. Suspendisse finibus mauris et bibendum molestie. Aenean ex augue, varius et pulvinar in, pretium non nisi." },
    { year: 1937, content: "Proin quam velit, efficitur vel neque vitae, rhoncus commodo mi. Suspendisse finibus mauris et bibendum molestie. Aenean ex augue, varius et pulvinar in, pretium non nisi." },
    { year: 1937, content: "Proin quam velit, efficitur vel neque vitae, rhoncus commodo mi. Suspendisse finibus mauris et bibendum molestie. Aenean ex augue, varius et pulvinar in, pretium non nisi." },
    { year: 1937, content: "Proin quam velit, efficitur vel neque vitae, rhoncus commodo mi. Suspendisse finibus mauris et bibendum molestie. Aenean ex augue, varius et pulvinar in, pretium non nisi." },
    { year: 1937, content: "Proin quam velit, efficitur vel neque vitae, rhoncus commodo mi. Suspendisse finibus mauris et bibendum molestie. Aenean ex augue, varius et pulvinar in, pretium non nisi." },
    { year: 1937, content: "Proin quam velit, efficitur vel neque vitae, rhoncus commodo mi. Suspendisse finibus mauris et bibendum molestie. Aenean ex augue, varius et pulvinar in, pretium non nisi." },

  ];

  return (
    <section className="timeline" ref={timelineRef}>
      <ol>
        {timelineData.map((item, index) => (
          <TimelineItem key={index} year={item.year} content={item.content} />
        ))}
      </ol>
    </section>
  );
};

export default Timeline;