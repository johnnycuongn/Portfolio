
import { v4 as uuid } from 'uuid';
const PORTFOLIO = {
  name: "Duc (Johnny) Nguyen",
  role: "Software Engineer",
  description: "A product-focused software engineer",
  techs: ["Typescript", "AWS", "Node.js", ".NET Core", "PostgreSQL", "MySQL"],
  email: 'cuongdn2001@gmail.com',
  resume_link: 'https://drive.google.com/file/d/1D_E7dgsFJ0QsSITeFXiBe83FADG9Xslm/view?usp=sharing'
}

const PROFILE_LINKS = [
  {
    id: uuid(),
    link: "https://github.com/johnnycuongn",
    title: "GitHub",
  },
  {
    id: uuid(),
    link: "https://www.linkedin.com/in/johnny-nguyen-2001jcn/",
    title: "LinkedIn",
  }
]

interface JobTimeLineItem {
  year: string;
  /** Short label for the timeline axis, e.g. '2023'. Falls back to `year`. */
  axisLabel?: string;
  title: string;
  company: string;
  content: string;
  link: string;
  stacks: string[];
}
const JobTimelineData: JobTimeLineItem[] = [
  {
    year: 'Nov 2025 - Present', 
    title: 'Software Engineer', 
    content: "I have worked on more than 4 enterprise systems across various industry sectors, owning features and complex workflows, for example invoicing and auditing, under tight deadlines and fast-paced sprint cycles. In this role, I also provide technical ownership, including AWS infrastructure, deployment pipelines with GitHub Actions, feature analysis, and UI/UX design.",
    axisLabel: 'Now',
    company: 'iMSX',
    link: 'https://imsx.com.au/',
    stacks: ['Typescript', 'AWS', 'Angular', '.NET Core', 'PostgreSQL', 'MySQL', 'MSSQL', 'Docker'],
  },
  {
    year: 'Nov 2024 - Feb 2025', 
    title: 'Software Engineer Intern', 
    content: "Managed and built License Management System from the ground up, which is used to manage Sharepoint Licenses for over 10 clients.",
    axisLabel: '2024–25',
    company: 'WebVine',
    link: 'https://webvine.com.au/',
    stacks: ['React', 'Next.js', 'Typescript', 'TailwindCSS', '.NET Core', 'Sharepoint SPFx', 'Azure'],
  },
  {
    year: 'Feb - Oct 2023',
    title: 'Junior Software Engineer',
    axisLabel: '2023',
    company: 'Orefox AI',
    content: 'Worked closely with senior engineers to improve current Orefox GeoDesk platforms and new apps. Responsible for advanced features including GeoDesk Scrum Board, Geological Map, Marketplace Platform, and Geologist Chat Platform',
    link: 'https://orefox.com/',
    stacks: ['React', 'Typescript', 'jQuery', 'Django', 'PostgreSQL', 'GeoDjango'],
  },
  {
    year: 'Mar - Dec 2022',
    title: 'Software Engineer',
    axisLabel: '2022',
    company: 'Queensland Murray Darling Catchment',
    link: 'https://qmdcl.org.au/',
    content: 'Led the development of Water Quality Monitoring platforms, built a new mobile app for river rangers to collect water data in offline mode, and improved the existing web app for data visualization.',
    stacks: ['React', 'React Native','Typescript', 'Node.js', 'Material UI', 'Firebase']
    }
];

interface Project {
  id: string;
  title: string;
  image: string;
  github: string;
  description: string;
  stacks: string[];
}

const PROJECTS: Project[] = [
  {
    id: uuid(),
    title: 'Smart Inventory Management System',
    github: 'https://github.com/johnnycuongn/Inventory-Management-Sytem',
    image: 'https://raw.githubusercontent.com/johnnycuongn/Inventory-Management-Sytem/main/github_resources/poster.png',
    description: 'A Smart Inventory System leveraging RFID technology to enhance efficiency in Inbound and Outbound Warehouse Processes.',
    stacks: ["React", "Typescript", "Node.js", "MongoDB", "Vercel"]
  },
  {
    id: uuid(),
    title: 'Supplier Receipt Tracker',
    image: 'https://raw.githubusercontent.com/johnnycuongn/sp_app/master/github_resources/poster.png',
    github: 'https://github.com/johnnycuongn/sp_app',
    description: 'The Supplier Receipt Tracker is designed to streamline invoice management for businesses in Retail, Manufacturing, Construction, and Hospitality sectors. This intuitive platform helps users track both digital and physical invoices, providing a comprehensive dashboard to monitor financial health.',
    stacks: ["React", "Typescript", "Firebase"]
  },
  {
    id: uuid(),
    title: 'QMDCL Water Quality Monitoring Platform',
    image: '',
    github: '',
    description: 'Led the development of Water Quality Monitoring platforms, built a new mobile app for river rangers to collect water data in offline mode, and improved the existing web app for data visualization.',
    stacks: ["React", "React Native", "Typescript", "Node.js", "Material UI", "Firebase"]
  }
];

export { JobTimelineData as TimelineData, PORTFOLIO, PROFILE_LINKS, PROJECTS };
export type { JobTimeLineItem, Project };
