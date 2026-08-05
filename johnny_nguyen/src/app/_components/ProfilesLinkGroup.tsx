import { motion, useAnimation } from "motion/react";
import { FC, JSX, useEffect } from "react";
import { FaGithub, FaLinkedin, FaGoodreads } from "react-icons/fa";
import { PROFILE_LINKS } from "../PORTFOLIO";
import wait from "@/utils/wait";
import openInNewTab from "@/utils/openInNewTab";

interface PublicProfile {
  title: string;
}

interface ProfileLinkGroupItemProps extends PublicProfile {
  index: number;
}

const iconMap: { [key: string]: JSX.Element } = {
  GitHub: <FaGithub size={'35'}/>,
  LinkedIn: <FaLinkedin size={'35'}/>,
  Goodreads: <FaGoodreads size={'35'}/>
};

const ProfileLinkGroupItem: FC<ProfileLinkGroupItemProps> = ({ index, title }) => {

  const controls = useAnimation();



  useEffect(() => {
    if (!controls) return;
    const jumpIcons = async () => {
      await wait((index * 0.3 * 1000))
      controls.start({
        y: [0, -8, 0],
        transition: { duration: 1 }
      })
    }
    jumpIcons();

    const interval = setInterval(() => {
      jumpIcons();
    }, 10000)

    return () => clearInterval(interval);
  }, [controls, index]);

  const profile = PROFILE_LINKS.find(item => item.title === title);

  return (
    // The click lives on the <li>, not the <button>: whileTap's scale moves the icon out from
    // under a held cursor, so mousedown and mouseup land on different elements and the browser
    // dispatches `click` on their common ancestor. The <li> never transforms, so it always
    // catches it — including the click a focused button synthesises for Enter/Space.
    <li onClick={() => openInNewTab(profile?.link)}>
      <motion.div
        className="bg-slate-900 text-white rounded select-none flex items-center gap-2 group"
        animate={controls}
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.1 }}
        title={title}
      >
        <button
          aria-label={`Open my ${title} profile in a new tab`}
          className="cursor-pointer"
        >
          {iconMap[title]}
        </button>
      </motion.div>
    </li>
  );
};

ProfileLinkGroupItem.displayName = "ProfileLinkGroupItem";

function PublicProfilesBar({items}: { items: PublicProfile[]}) {
  return (
    <ul className="flex flex-wrap gap-4">
      {items.map((item, i) => (
        <ProfileLinkGroupItem key={item.title} index={i} title={item.title} />
      ))}
    </ul>
  );
}

export default PublicProfilesBar;