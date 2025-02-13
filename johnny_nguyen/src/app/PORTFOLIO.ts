interface JobTimeLineItem {
  year: string;
  title: string;
  company: string;
  content: string;
  link: string;
  stacks: string[];
}
const TimelineData: JobTimeLineItem[] = [
  {
    year: 'Nov 2024 - Feb 2025', 
    title: 'Software Engineer Intern', 
    content: "sdfuhasldskdfjlsdfjsldkfjlsdkfjlsdjfkslkdjflsdjflsjdflskdjflsjdfklsdjflsdkfjlsdkfjsldfjslkdfjsldkfjsldkfjsldkfjslkdjfslkdfjlskfjjkhaslkdfhaklsdhfkjlasdhfklasjdhfklajsdhflkajsdhflkasjdhlaksjdhlkasjdhflaksjdhlaksjdhlaksjdfhalksdjhaklsdf",
    company: 'WebVine',
    link: 'https://webvine.com.au/',
    stacks: ['React', 'Next.js', 'Typescript', 'TailwindCSS', '.NET Core', 'Sharepoint SPFx', 'Azure'],
  },
  {
    year: 'Feb - Oct 2023',
    title: 'Junior Software Engineer',
    company: 'Orefox',
    content: 'skldjflskdjflksdjflksdjf;lsdjfgs;ldfvns;ldfgkh;sdlfgk;sdfjg;lsdkfjg;sdkfjg;sldfkj;lsdgfj',
    link: '',
    stacks: ['React', 'Typescript', 'jQuery', 'Django', 'PostgreSQL'],
  },
  {
    year: 'Mar - Dec 2022',
    title: 'Software Engineer',
    company: 'Queensland Murray Darling Catchment',
    link: 'https://qmdcl.org.au/',
    content: '',
    stacks: ['React', 'React Native','Typescript', 'Node.js', 'Firebase']
    }
];

export { TimelineData };
export type { JobTimeLineItem };
