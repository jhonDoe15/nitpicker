import type { Finding } from '../../../../../../../../shared/values/findings.mts';
import type {
  FunctionFact,
  PropertyFact,
  ScopeFact,
  SourceFile,
  SpringView,
} from '../../../spring/typed/spring-shapes.mts';

export type Link = { name: string; arguments?: string[] };

export type Collection = {
  root?: string | undefined;
  links: Link[];
  range?: { from: string; to: string } | undefined;
};

export type Frame = ScopeFact & { collection?: Collection | undefined };

export type SiteLike = Pick<Frame, 'host' | 'parent' | 'argument' | 'collection'>;

type Via = { helper: string; line: number; bounded: boolean };

export type Region = {
  view: SpringView;
  top: ScopeFact;
  depth: number;
  visiting: Set<string>;
  via?: Via;
};

export type Reach = {
  call: string;
  kind: string;
  helper: string | undefined;
  bounded: boolean;
  line: number;
};

export type Work = Reach & { lines: number[] };

export type Located = { view: SpringView; fn: FunctionFact };

export type GlobalFact = PropertyFact & { view: SpringView };

export type ProjectIndex = {
  global: (view: SpringView, name: string) => GlobalFact | undefined;
  viewOf: (file: SourceFile) => SpringView | undefined;
  topLevel: (view: SpringView, name: string) => Located[];
};

export type FanOutFinding = Finding & { location: { line: number } };

export type FanOutReport = { finding: FanOutFinding; lines: number[] };

export type FanOutResult = { findings: FanOutFinding[]; calls: Set<string> };

export type FanOutInput = {
  own: SourceFile[];
  projectFiles: SourceFile[];
  projectRoot: string;
  javaRoots: string[];
};

export type Task = { scope: ScopeFact; starter: string; work: Work };

export type WorkText = { call: string; helper?: string | undefined };

export type MessageWork = WorkText & { kind: string };
