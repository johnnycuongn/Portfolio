
import { v4 as uuid } from 'uuid';
const PORTFOLIO = {
  name: "Duc Cuong Nguyen",
  role: "Junior Software Engineer",
  description: "A junior software engineer with 1+ years of experience, who focuses on providing the most high-quality and usable solutions, specialising in React and Typescript. Aimed to deliver projects on time while implementing software engineering practices in the team. Seeking an opportunity for growth, leveraging my software development passion to contribute to high-impact projects.",
  techs: ["Typescript", "React", "Node.js", ".NET Core", "PostgreSQL"],
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
  title: string;
  company: string;
  content: string;
  link: string;
  stacks: string[];
}
const JobTimelineData: JobTimeLineItem[] = [
  {
    year: 'Nov 2024 - Feb 2025', 
    title: 'Software Engineer Intern', 
    content: "Managed and built License Management System from the ground up, which is used to manage Sharepoint Licenses for over 10 clients.",
    company: 'WebVine',
    link: 'https://webvine.com.au/',
    stacks: ['React', 'Next.js', 'Typescript', 'TailwindCSS', '.NET Core', 'Sharepoint SPFx', 'Azure'],
  },
  {
    year: 'Feb - Oct 2023',
    title: 'Junior Software Engineer',
    company: 'Orefox AI',
    content: 'Worked closely with senior engineers to improve current Orefox GeoDesk\' platforms and new apps. Responisble for advanced features inlcuding GeoDesk Scrum Board, Geological Map, Marketplace Platform, and Geologist Chat Platform',
    link: 'https://orefox.com/',
    stacks: ['React', 'Typescript', 'jQuery', 'Django', 'PostgreSQL', 'GeoDjango'],
  },
  {
    year: 'Mar - Dec 2022',
    title: 'Software Engineer',
    company: 'Queensland Murray Darling Catchment',
    link: 'https://qmdcl.org.au/',
    content: 'Led the development of Water Quality Monitoring platforms, built a new mobile app for river rangers to collect water data in offline mode, and improved the existing web app for data visualization.',
    stacks: ['React', 'React Native','Typescript', 'Node.js', 'Material UI', 'Firebase']
    }
];

const PROJECTS = [
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
    description: ''
  }
]

export { JobTimelineData as TimelineData, PORTFOLIO, PROFILE_LINKS, PROJECTS };
export type { JobTimeLineItem };
