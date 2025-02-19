import { useState } from "react";

const useDelayedLinkOpen = (delay: number) => {
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

export default useDelayedLinkOpen;