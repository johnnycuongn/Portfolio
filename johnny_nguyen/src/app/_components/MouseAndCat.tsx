import React, { useState, useEffect, useCallback } from 'react';
import { motion, useAnimation } from 'framer-motion';
import useMousePosition from '@/utils/useMousePosition';

interface TrailProps {
  fireflyPosition: { x: number; y: number };
}

interface TrailDot {
  id: number;
  x: number;
  y: number;
}

const Trail: React.FC<TrailProps> = React.memo(({ fireflyPosition }) => {
  const [trail, setTrail] = useState<TrailDot[]>([]);

  useEffect(() => {
    const newDot = { id: Date.now(), x: fireflyPosition.x, y: fireflyPosition.y };
    setTrail(prevTrail => [...prevTrail, newDot].slice(-20)); // Keep last 20 positions

    const timer = setTimeout(() => {
      setTrail(prevTrail => prevTrail.slice(1)); // Remove oldest dot after 1 second
    }, 1000);

    return () => clearTimeout(timer);
  }, [fireflyPosition]);

  return (
    <>
      {trail.map((dot, index) => (
        <motion.div
          key={dot.id}
          style={{
            position: 'absolute',
            left: dot.x,
            top: dot.y,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'rgba(230,255,150,0.3)',
          }}
          initial={{ opacity: 0.7, scale: 1 }}
          animate={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 1 }}
        />
      ))}
    </>
  );
});

Trail.displayName = 'Trail';

const MouseAndCat = () => {
  const mousePosition = useMousePosition();
  const controls = useAnimation();
  const [dotPosition, setDotPosition] = useState({ x: 100, y: 100 });

  const runAway = useCallback(() => {
    const newX = Math.random() * (window.innerWidth - 20);
    const newY = Math.random() * (window.innerHeight - 20);
    controls.start({
      x: newX,
      y: newY,
      transition: { type: 'spring', duration: 5 }
    });
    setDotPosition({ x: newX, y: newY });
  }, [controls]);

  const wander = useCallback(() => {
    const newX = dotPosition.x + (Math.random() - 0.5) * 100;
    const newY = dotPosition.y + (Math.random() - 0.5) * 100;
    controls.start({
      x: newX,
      y: newY,
      transition: { type: 'tween', duration: 2 }
    });
    setDotPosition({ x: newX, y: newY });
  }, [controls, dotPosition]);

  React.useEffect(() => {
    const interval = setInterval(wander, 3000);
    return () => clearInterval(interval);
  }, [wander]);

  React.useEffect(() => {
    const dx = mousePosition.x - dotPosition.x;
    const dy = mousePosition.y - dotPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 100) {
      runAway();
    }
  }, [mousePosition, dotPosition, runAway]);

  return (
    <>
    <motion.div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: '#fddba3',
        position: 'absolute',
        zIndex: 100
      }}
      animate={controls}
      initial={{ x: dotPosition.x, y: dotPosition.y }}
    >
      <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 2,
            ease: "easeInOut",
            times: [0, 0.5, 1],
            repeat: Infinity,
          }}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(230,255,150,1) 0%, rgba(230,255,150,0.8) 25%, rgba(230,255,150,0.4) 50%, rgba(230,255,150,0) 75%)',
            boxShadow: '0 0 10px 5px rgba(230,255,150,0.3)',
          }}
        />
        
    </motion.div>
    <Trail fireflyPosition={dotPosition} />
    </>
  );
};




export default MouseAndCat;