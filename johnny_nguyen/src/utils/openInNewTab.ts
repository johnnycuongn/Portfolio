const openInNewTab = (url?: string) => {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

export default openInNewTab;
