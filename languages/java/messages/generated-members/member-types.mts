import type { MemberFrame } from '../../source/frames/member-frames.mts';

export type Annotation = {
  name: string;
  start: number;
  end: number;
  argumentsStart: number | undefined;
  argumentsEnd: number | undefined;
};

export type JavaField = {
  name: string;
  type: string;
  modifiers: string[];
  annotations: Annotation[];
  line: number;
  offset: number;
};

export type JavaMethod = { name: string; parameters: number };

export type JavaClass = {
  name: string;
  simple: string;
  kind: string;
  owner: JavaClass | undefined;
  annotations: Annotation[];
  line: number;
  extendsName: string | undefined;
  typeParameters: string[];
  bodyStart: number;
  fields: JavaField[];
  methods: JavaMethod[];
};

export type LombokConfig = (key: string) => string | undefined;

export type JavaSource = {
  file: string;
  raw: string;
  packageName: string;
  imports: string[];
  wildcards: string[];
  imported: Set<string>;
  classes: JavaClass[];
  config: LombokConfig;
};

export type ProjectClass = JavaClass & { qualified: string; source: JavaSource };

export type JavaProject = { sources: JavaSource[]; classes: Map<string, ProjectClass> };

export type LombokContext = { raw: string; imported: Set<string>; config: LombokConfig };

export type MemberKind = 'toString' | 'equals';

export type Frame = MemberFrame & { klass: JavaClass | undefined };
export type State = {
  text: string;
  starts: number[];
  classes: JavaClass[];
  frames: Frame[];
  skip: number;
};
export type Handler = (state: State, frame: Frame, offset: number) => void;
