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
    stacks: ['React', 'React Native','Typescript', 'Node.js', 'Firebase']
    }
];

export { JobTimelineData as TimelineData };
export type { JobTimeLineItem };
