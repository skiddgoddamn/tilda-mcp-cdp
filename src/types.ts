export interface TildaProject {
  id: string;
  title: string;
  descr?: string;
  customdomain?: string;
}

export interface TildaPage {
  id: string;
  projectid: string;
  title: string;
  descr?: string;
  alias?: string;
  date?: string;
  published?: string;
}

export interface TildaPageFull extends TildaPage {
  html?: string;
  css?: string;
  js?: string;
  img?: Array<{ from: string; to: string }>;
}
