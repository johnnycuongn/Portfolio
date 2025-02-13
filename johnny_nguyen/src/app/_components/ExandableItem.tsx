import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ExpandableDiv = ({ id, content }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <AnimatePresence>
      {isExpanded ? (
        <motion.div
          key={`expanded-${id}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-4 bg-white shadow-lg rounded-lg p-6 z-50 overflow-auto"
          onClick={() => setIsExpanded(false)}
        >
          <h2 className="text-2xl font-bold mb-4">Expanded Content {id}</h2>
          <p>{content}</p>
        </motion.div>
      ) : (
        <motion.div
          key={`collapsed-${id}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-gray-100 p-4 rounded-md cursor-pointer mb-4"
          onClick={() => setIsExpanded(true)}
        >
          Click to expand {id}
        </motion.div>
      )}
    </AnimatePresence>
  );
};