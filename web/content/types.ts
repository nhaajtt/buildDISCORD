export type Dict = {
  lang: "vi" | "en";
  meta: { title: string; description: string };
  nav: { how: string; themes: string; commands: string; faq: string; cta: string; switchTo: string; switchHref: string; theme: string; home: string };
  hero: { title: string; sub: string; cta: string; secondary: string; commandLabel: string; empty: string };
  scene: {
    title: string;
    steps: { t: string; d: string }[];
    cmd: string;
    roles: string;
    rules: string;
    stamp: string;
    done: string;
  };
  themes: {
    title: string;
    sub: string;
    items: { id: string; label: string; blurb: string }[];
    rolesLabel: string;
    channelsLabel: string;
    sharedLabel: string;
    tablist: string;
  };
  rules: { title: string; sub: string };
  music: { title: string; body: string; points: string[] };
  commands: { title: string; items: { name: string; args: string; d: string }[] };
  faq: { title: string; items: { q: string; a: string }[] };
  cta: { title: string; steps: string[]; button: string; note: string; setupId: string };
  footer: { word: string; line: string; privacy: string; terms: string };
};
