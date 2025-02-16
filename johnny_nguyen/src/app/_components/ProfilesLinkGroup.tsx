import { motion, Reorder, useAnimation } from "motion/react";
import { FC, JSX, memo, useEffect, useState } from "react";
import { FaGithub, FaLinkedin, FaGoodreads } from "react-icons/fa";
import { PROFILE_LINKS } from "../PORTFOLIO";
import wait from "@/utils/wait";

interface PublicProfile {
  title: string;
}

interface ProfileLinkGroupItemProps extends PublicProfile {
  index: number;
}

const iconMap: { [key: string]: JSX.Element } = {
  GitHub: <FaGithub size={'25'}/>,
  LinkedIn: <FaLinkedin size={'25'}/>,
  Goodreads: <FaGoodreads size={'25'}/>
};

const ProfileLinkGroupItem: FC<ProfileLinkGroupItemProps> = ({ index, title }) => {

  const controls = useAnimation();

  useEffect(() => {
    if (!controls) return;
    jumpIcons();

    const interval = setInterval(() => {
      jumpIcons();
    }, 10000)

    return () => clearInterval(interval);
  }, []);

  const jumpIcons = async () => {
      await wait((index * 0.3 * 1000))
      controls.start({
        y: [0, -8, 0],
        transition: { duration: 1 }
      })
  }

  const handleItemClick = (title: string) => {
    const item = PROFILE_LINKS.find(item => item.title === title);
    if (item) {
      window.open(item.link, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <Reorder.Item value={title} id={title}>
      <motion.div
        className="bg-slate-900 text-white rounded cursor-grab active:cursor-grabbing select-none flex items-center gap-2 group"
        animate={controls}
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.1 }}
        title="Drag to reorder"
      >
        <span onClick={() => handleItemClick(title)}>
          {iconMap[title]}
        </span>
      </motion.div>
    </Reorder.Item>
  );
};

ProfileLinkGroupItem.displayName = "ProfileLinkGroupItem";

function PublicProfilesBar({items}: { items: PublicProfile[]}) {
  const [tabs, setTabs] = useState(items.map(item => item.title));

  return (
    <Reorder.Group 
      axis="x" 
      values={tabs} 
      onReorder={setTabs}
      className="flex flex-wrap gap-4"
    >
      {tabs.map((item, i) => (
        <ProfileLinkGroupItem key={item} index={i} title={item} />
      ))}
    </Reorder.Group>
  );
}

export default PublicProfilesBar;