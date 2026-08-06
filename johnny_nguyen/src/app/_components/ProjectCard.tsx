import { motion, useAnimation, useReducedMotion } from 'motion/react';
import { FC, memo } from 'react';
import Image from 'next/image';
import { FiExternalLink } from "react-icons/fi";
import { PROJECTS } from '../PORTFOLIO';
import useDelayedLinkOpen, { canDelayOpen } from '@/utils/useDelayLinkOpen';

interface ProjectCardProps {
  className?: string;
  index: number;
  projectId: string;
}

const FALLBACK_LINK = 'https://github.com/johnnycuongn';

const ProjectCard: FC<ProjectCardProps> = memo(({className, index, projectId}) => {

  const project = PROJECTS.find(project => project.id === projectId) ?? {
    id: '1',
    title: 'Empty',
    image: '',
    github: '',
    description: '',
    stacks: []
  };
  const controls = useAnimation();
  const reduceMotion = useReducedMotion();
  const { navigating, navigate } = useDelayedLinkOpen(200)

  const handleProjectClicked = async (e: React.MouseEvent) => {
    // Leave the anchor to open the tab itself wherever the deferred open would
    // be blocked or is pointless — see canDelayOpen.
    if (!canDelayOpen(e, reduceMotion)) return;

    e.preventDefault()

    if (navigating) return;

    await controls.start({
      x: '100%',
      y: '-100%',
      opacity: 0,
      transition: { duration: 0.5 }
    });
    navigate(project.github || FALLBACK_LINK);
    setTimeout(async () => {
      await controls.start({
        x: '0',
        y: '0',
        opacity: 1,
        transition: { duration: 0.5 }
      });
    }, 2000)

  }

  return (
    <motion.div
      data-rail-card
      whileHover={reduceMotion ? undefined : { y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={(className ?? '') + ' overflow-hidden rounded-lg bg-slate-800 shadow-lg hover:shadow-xl'}>
        <div className="group/item relative flex h-full flex-col">
          <a
            href={project.github || FALLBACK_LINK}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleProjectClicked}
            onFocus={(e) => e.currentTarget.scrollIntoView({
              behavior: reduceMotion ? 'auto' : 'smooth',
              inline: 'nearest',
              block: 'nearest'
            })}
            className="absolute inset-0 z-10 cursor-pointer"
            aria-label={`${project.title} on GitHub`}
          ></a>

          <div className="relative shrink-0 basis-[55%] bg-slate-900">
            {project.image ? (
              <Image
                className="object-cover"
                src={project.image}
                alt={`${project.title} preview`}
                fill
                sizes="(max-width: 767px) 85vw, (max-width: 1079px) 65vw, 41vw"
                quality={90}
                priority={index === 0}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-slate-700/40 to-slate-900" />
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-5">
            <h3 className="text-xl font-semibold text-white transition-colors group-hover/item:text-teal-300 md:text-2xl">
              {project.title}
              <motion.span
                className='inline-block ml-2'
                animate={controls}
                initial={{ x: 0, y: 0, opacity: 1 }}
              >
                <FiExternalLink />
              </motion.span>
            </h3>
            <p className="mt-2 line-clamp-3 text-sm leading-7 text-gray-300 md:text-base">
              {project.description}
            </p>
            <div className="mt-auto flex flex-wrap gap-1 pt-4">
              {project.stacks.map((stack) => (
                <span key={stack} className="flex items-center rounded-full bg-teal-400/10 px-3 py-1 text-xs font-medium leading-5 text-teal-300">
                  {stack}
                </span>
              ))}
            </div>
          </div>
        </div>
    </motion.div>
  )
})

ProjectCard.displayName = 'ProjectCard';

export default ProjectCard;
