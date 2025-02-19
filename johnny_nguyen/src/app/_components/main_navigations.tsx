import React, { useState, useEffect, FC } from 'react';
import { motion, Reorder, useAnimation } from 'framer-motion';
import { TbCopy, TbCopyCheckFilled } from 'react-icons/tb';

interface TabItemProps {
  item: string;
}

const TabItem: FC<TabItemProps> = ({ item }) => {
  const controls = useAnimation();
  const [isContactClicked, setIsContactClicked] = useState(false)
  const [isCopyClicked, setIsCopyClicked] = useState(false)

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

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (item === 'Resume') {
      window.open('https://drive.google.com/file/d/1MkXIev6V0o_DlBT9-1G8Apkxj6CFHrvr/view?usp=sharing', '_blank');
    }
    else if (item==='Contact') {
      
      navigator.clipboard.writeText('cuongdn2001@gmail.com');
      if (isContactClicked) {
        setIsCopyClicked(true)
      }
      else {
        setIsCopyClicked(false)
        setIsContactClicked(true)
        setTimeout(() => {
          setIsContactClicked(false)
        }, 3000)
      }
      
    }
  };


  return (
    <Reorder.Item value={item} id={item}>
      <motion.div
        className="bg-slate-900 text-white rounded px-4 py-2 cursor-grab active:cursor-grabbing select-none flex items-center gap-2 group"
        whileHover={{ backgroundColor: "#4B5563" }}
        whileTap={{ scale: 0.95 }}
        animate={controls}
        title="Drag to reorder navigation"
        onClick={handleClick}
      >
         {isContactClicked && item === 'Contact' ? (
            <>
            <span>Email me at cuongdn2001@gmail.com</span>
            {isCopyClicked ? <TbCopyCheckFilled /> : <TbCopy />}
            </>
        ) : (
          item
        )}
      </motion.div>
    </Reorder.Item>
  );
};

function PortfolioNavBar() {
  const [items, setItems] = useState(['Resume', 'Contact']);

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

export default PortfolioNavBar;