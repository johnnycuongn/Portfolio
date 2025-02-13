import React, { useState, useEffect, FC } from 'react';
import { motion, Reorder, useAnimation } from 'framer-motion';

interface TabItemProps {
  item: string;
}

const TabItem: FC<TabItemProps> = ({ item }) => {
  const controls = useAnimation();

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
  }, []);

  return (
    <Reorder.Item value={item} id={item}>
      <motion.div
        className="bg-slate-900 text-white rounded px-4 py-2 cursor-grab active:cursor-grabbing select-none flex items-center gap-2 group"
        whileHover={{ backgroundColor: "#4B5563" }}
        whileTap={{ scale: 0.95 }}
        animate={controls}
        title="Drag to reorder tabs"
      >
        {item}
      </motion.div>
    </Reorder.Item>
  );
};

function PortfolioNavBar() {
  const [items, setItems] = useState(['Home', 'Resume', 'Contact']);

  return (
    <nav className="fixed top-0 right-0 p-2 z-50">
      <Reorder.Group 
        axis="x" 
        values={items} 
        onReorder={setItems}
        className="flex flex-row gap-2"
      >
        {items.map((item) => (
          <TabItem key={item} item={item} />
        ))}
      </Reorder.Group>
    </nav>
  );
}

export { PortfolioNavBar };