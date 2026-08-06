
import { v4 as uuid } from 'uuid';
const PORTFOLIO = {
  name: "Duc (Johnny) Nguyen",
  preferred_name: "Johnny",
  role: "Software Engineer",
  pronouns: 'him',
  description: "A product-focused software engineer, passionate about building scalable and efficient software solutions. Strong focus on scalable architecture and clean, testable code, with experience owning features end to end from infrastructure to deployment.",
  techs: ["Typescript", "AWS", "Node.js", ".NET Core", "PostgreSQL", "MySQL"],
  email: 'cuongdn2001@gmail.com'
}

/**
 * The resume as it appears on the page. The PDF is self-hosted and is both the
 * download target and the fallback if a page image will not render; the page
 * images beside it are generated from that PDF by `npm run resume`.
 */
const RESUME = {
  pdf: '/resume.pdf',
  navTitle: 'View my resume without leaving the page',
  downloadLabel: 'Download PDF',
  closeLabel: 'Close resume',
  dialogLabel: `${PORTFOLIO.name} — resume`,
  zoomInLabel: 'Zoom in to read',
  zoomOutLabel: 'Fit the whole page',
  /** `{n}` and `{total}` are substituted per page at render. */
  pageAlt: 'Resume, page {n} of {total}',
  /** Replaces the sheet when a page image fails to load. */
  errorMessage: 'The resume would not render here.',
};

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

const CHAT_NAME = 'Firefly';

const CHAT = {
  /** The firefly hosts the chat. It talks about you, never as first person. */
  name: CHAT_NAME,
  greeting: `Hi — I hang around this page. Ask me anything about ${PORTFOLIO.preferred_name}.`,
  chips: [
    { label: `Who is ${PORTFOLIO.preferred_name}?`, question: `Who is ${PORTFOLIO.preferred_name}? Tell me about ${PORTFOLIO.pronouns}.` },
    { label: 'His experience', question: `What's ${PORTFOLIO.preferred_name}'s experience?` },
    { label: 'Resume', question: `Can I see ${PORTFOLIO.preferred_name}'s resume?` },
  ],
  placeholder: `Ask about ${PORTFOLIO.preferred_name}…`,
  /** Quiet nudge beside the beacon while the Experience section is in view. */
  hintLabel: 'Ask me',
  privacyNote: 'This chat stays in your browser.',
  clearLabel: 'Clear',
  /** Shown client-side when the request never made it back at all (offline, parse failure). */
  offlineMessage: `Can't reach my brain from here. ${PORTFOLIO.preferred_name}'s inbox always works though — ${PORTFOLIO.email}.`,
  /** Beacon aria-label when the panel is closed. */
  openLabel: `Ask ${CHAT_NAME} about ${PORTFOLIO.preferred_name}`,
  /** Beacon and panel-header aria-label when the panel is open. */
  closeLabel: 'Close chat',
  /** Dialog aria-label for the panel itself. */
  dialogLabel: `Chat with ${CHAT_NAME}`,
};

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
    year: 'Mar 2025 - Present', 
    title: 'Software Engineer', 
    content: "Worked on enterprise systems across various industry sectors, including finance, advertising compliance, NDIS and insurance. Owned the development of new features, infrastructure, and solutions end-to-end.",
    axisLabel: 'Now',
    company: 'iMSX',
    link: 'https://imsx.com.au/',
    stacks: ['Typescript', 'AWS', 'Angular', '.NET Core', 'PostgreSQL', 'MySQL', 'MSSQL', 'Docker'],
  },
  {
    year: 'Nov 2024 - Feb 2025', 
    title: 'Software Engineer Intern', 
    content: "Built and managed a License Management System from the ground up, used to administer SharePoint licenses for 20+ clients.",
    axisLabel: '2024–25',
    company: 'WebVine',
    link: 'https://webvine.com.au/',
    stacks: ['React', 'Next.js', 'Typescript', 'TailwindCSS', '.NET Core', 'Sharepoint SPFx', 'Azure'],
  },
  {
    year: 'Feb 2023 - Oct 2023',
    title: 'Junior Software Engineer',
    axisLabel: '2023',
    company: 'OreFox AI',
    content: 'Worked closely with senior engineers to improve the Orefox GeoDesk platform and build new apps, owning advanced features including the Scrum Board, Geological Map, Marketplace, and Geologist Chat platform."',
    link: 'https://orefox.com/',
    stacks: ['React', 'Typescript', 'jQuery', 'Django', 'PostgreSQL', 'GeoDjango', 'AWS'],
  },
  {
    year: 'Mar 2022 - Dec 2022',
    title: 'Software Engineer',
    axisLabel: '2022',
    company: 'Queensland Murray Darling Catchment',
    link: 'https://qmdcl.org.au/',
    content: 'Led the development of Water Quality Monitoring platforms, built a new mobile app for river rangers to collect water data in offline mode, migrated from Excel to admin platform for data visualisation and analytics.',
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
    title: 'Support Guides Content Management System',
    github: 'https://www.hearingmattersaustralia.org/',
    image: 'https://raw.githubusercontent.com/johnnycuongn/Portfolio/master/Public/hma_combine.png',
    description: 'A Content Management System for Hearing Matters Australia, a non-profit organisation. The CMS allows the organisation to manage their website content, including news, events, and resources.',
    stacks: ["React", "Typescript", "Firebase"]
  },
  {
    id: uuid(),
    title: 'Water Quality Monitoring Platform',
    image: 'https://raw.githubusercontent.com/johnnycuongn/Portfolio/master/Public/masked_events_data_tab.png',
    github: 'https://qmdcl-water-project-staging.web.app/',
    description: 'Allow river rangers to collect water quality data in their tablets, and sync the data with site managers',
    stacks: ["React", "Chart.js", "React Native", "Typescript", "Node.js", "Material UI", "Firebase"]
  },
  {
    id: uuid(),
    title: 'Smart Inventory Management System',
    github: 'https://github.com/johnnycuongn/Inventory-Management-Sytem',
    image: 'https://raw.githubusercontent.com/johnnycuongn/Inventory-Management-Sytem/main/github_resources/poster.png',
    description: 'A Smart Inventory System leveraging RFID technology to enhance efficiency in Inbound and Outbound Warehouse Processes.',
    stacks: ["React", "Chart.js", "Typescript", "Node.js", "MongoDB", "Vercel"]
  },
  {
    id: uuid(),
    title: 'Supplier Receipt Tracker',
    image: 'https://raw.githubusercontent.com/johnnycuongn/sp_app/master/github_resources/poster.png',
    github: 'https://github.com/johnnycuongn/sp_app',
    description: 'The Supplier Receipt Tracker is designed to streamline invoice management for businesses in Retail, Manufacturing, Construction, and Hospitality sectors. This intuitive platform helps users track both digital and physical invoices, providing a comprehensive dashboard to monitor financial health.',
    stacks: ["React", "Typescript", "Firebase", "Chart.js"]
  },
];

export { JobTimelineData as TimelineData, PORTFOLIO, PROFILE_LINKS, PROJECTS, CHAT, RESUME };
export type { JobTimeLineItem, Project };
