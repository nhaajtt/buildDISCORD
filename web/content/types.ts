export type Plan = { id: string; name: string; price: string; blurb: string; features: string[] };

export type Dict = {
  lang: "vi" | "en";
  meta: { title: string; description: string };
  nav: {
    how: string;
    themes: string;
    pricing: string;
    commands: string;
    faq: string;
    devlog: string;
    cta: string;
    switchTo: string;
    switchHref: string;
    theme: string;
    home: string;
  };
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
  ai: {
    title: string;
    sub: string;
    inputLabel: string;
    description: string;
    levelLabel: string;
    levels: string[];
    resultLabel: string;
    sampleNote: string;
    plan: string;
  };
  editor: {
    title: string;
    sub: string;
    points: { t: string; d: string }[];
    mockLabel: string;
    removeLabel: string;
    renameLabel: string;
    add: string;
    build: string;
    cancel: string;
    footer: string;
  };
  themes: {
    title: string;
    sub: string;
    items: { id: string; label: string; blurb: string }[];
    rolesLabel: string;
    channelsLabel: string;
    sharedLabel: string;
    tablist: string;
    mixNote: string;
  };
  rules: { title: string; sub: string };
  music: { title: string; body: string; points: string[] };
  pricing: {
    title: string;
    sub: string;
    plans: Plan[];
    howTitle: string;
    how: string[];
    contact: string;
    note: string;
  };
  commands: { title: string; items: { name: string; args: string; d: string }[] };
  faq: { title: string; items: { q: string; a: string }[] };
  cta: { title: string; steps: string[]; button: string; note: string; setupId: string };
  footer: { word: string; line: string; privacy: string; terms: string; devlog: string; source: string };
};
