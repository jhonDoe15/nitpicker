export type TimeoutStop = {
  name: string;
  receiver?: string;
  argument?: string;
  root?: string;
};

export type TimeoutSource = {
  name: string;
  receiver?: string;
  executor?: string;
};

export type TimeoutHandler = { throws: boolean; passes: string[] };

export type AwaitedWork = { name: string; scope?: string; starter: string };

export type TimeoutEntry = {
  line: number;
  kind: string;
  name: string;
  owner?: string;
  function?: string;
  receiver?: string;
  variable?: string;
  visible: boolean;
  executors: string[];
  threads: string[];
  stops: TimeoutStop[];
  source?: TimeoutSource;
  unit?: { name: string; qualifier?: string };
  handlers: TimeoutHandler[];
  awaited: AwaitedWork[];
};

export type TimeoutProblem = { message: string; key: string };
