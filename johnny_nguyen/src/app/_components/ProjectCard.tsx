import { motion, useAnimation } from 'motion/react';
import { FC, useEffect, useState, memo } from 'react';
import Image from 'next/image';
import { FiExternalLink } from "react-icons/fi";
import { PROJECTS } from '../PORTFOLIO';
import useDelayedLinkOpen from '@/utils/useDelayLinkOpen';

interface ProjectCardProps {
  className?: string;
  index: number;
  projectId: string;
}

const ProjectCard: FC<ProjectCardProps> = memo(({className, index, projectId}) => {

  const project = PROJECTS.find(project => project.id === projectId) ?? {
    id: '1',
    title: 'Emtpy',
    image: 'Empty',
    github: '',
    description: '',
    stacks: []
  };
  const controls = useAnimation();
  const { navigating, navigate } = useDelayedLinkOpen(200)

  const [isLastOdd, setIsLastOdd] = useState(false);

  useEffect(() => {
    setIsLastOdd(index === 2);
  }, [])

  const handleProjectClicked = async (e: React.MouseEvent) => {
    e.preventDefault()

    if (navigating) return;

    await controls.start({
      x: '100%',
      y: '-100%',
      opacity: 0,
      transition: { duration: 0.5 }
    });
    navigate(project?.github ?? "https://github.com/johnnycuongn");
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
      whileHover={{ scale: 1.005 }}
      transition={{ duration: 0.1 }}
      key={projectId}
      className={(className ?? '') + ' bg-slate-800 md:p-3 md:m-4 rounded-lg shadow-lg max-h-200 '}>
        <div 
          className={'relative flex flex-col h-full group/item ' + (isLastOdd ? '' : 'md:flex-row')}
          onClick={handleProjectClicked}
        >
          <div className="relative flex-shrink-0 w-full md:w-1/2 h-48 md:h-full">
            <Image
              className="md:rounded-lg object-cover"
              src={project.image}
              alt={`${project.title} image`}
              layout="fill"
              quality={90}
              placeholder="blur" // Using a blur placeholder for better UX
              blurDataURL={project.image} // Add a low-res image for blur effect
              priority={index === 0} // Prioritize the first project image for better LCP
            />
          </div>
          <div className="flex flex-col overflow-auto p-5">
            <div>
              <h1 className="text-xl font-semibold text-white md:text-2xl transition-all group-hover/item:text-teal-300">
                {project.title}
                <motion.span 
                  className='inline-block ml-2'
                  animate={controls}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  whileHover={{ x: 5, y: -5, opacity: 1 }}
                >
                  <FiExternalLink />
                </motion.span>
              </h1>
              <p className="mt-2 text-sm/7 md:text-base text-gray-200">
                {project.description}
              </p>
            </div>
          </div>
        </div>
       
    </motion.div>
  )
})

ProjectCard.displayName = 'ProjectCard';

export default ProjectCard;