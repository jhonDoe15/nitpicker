import type {
  Annotation,
  ClassInfo,
  Host,
  HostFrame,
  Span,
  TestNode,
  TextTables,
} from './discovery-types.mts';
import type { KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { FindingFactory } from '../../typed/review-finding-types.mts';
import type { ProjectFlags } from './report-types.mts';

export type HeavyKind = 'always' | 'reused';

export type HeavyDeclaration = {
  name: string;
  offset: number;
  end: number;
  kind: HeavyKind | undefined;
};

export type StartSite = { offset: number; name: string; receiver?: string };

export type ChainStep =
  { done: true; site?: StartSite | undefined } | { done: false; next: number };

export type Resolved = { declaration: HeavyDeclaration; local: boolean };

export type StartReport = { offset: number; symbol: string; key: string };
export type Access = {
  offset: number;
  kind: 'call' | 'write';
  qualifier: string;
  outer: string;
  type: string;
  member: string;
};

export type NamedArg = { name?: string; text: string };

export type FloatHit = { name: string; offset: number };
export type ClockHit = { offset: number; end: number; family: string };

export type RuleInfo = { rule: string; message: string };

export type NetHit = { offset: number; family: string; literal: string | undefined };

export type BodyRange = Span & { next: number };

export type Construct = {
  construct: string;
  from: number;
  to: number;
  scans: Span[];
  branches?: Span[];
  header?: Span | undefined;
  exhaustive?: true;
};

export type IfParts = { branches: BodyRange[]; hasElse: boolean; end: number };

export type WhenParts = { branches: BodyRange[]; exhaustive: boolean; end: number; from: number };

export type FlowHit = { construct: string; from: number; to: number };

export type RangeScope = { callsAsserting(range: Span): boolean };

export type LoopScope = {
  callsAsserting(range: Span, test: TestNode): boolean;
  helperLoops(test: TestNode): (Construct & { helper: string })[];
};

export type Located = { symbol: string; offset: number; key?: string };

export type ConditionIndex = { methods: Map<string, boolean>; enabled: Map<string, boolean> };

export type SkipBase = {
  index: ConditionIndex;
  names: Set<string>;
  constants: Map<string, boolean>;
};

export type SkipContext = SkipBase & { chain: ClassInfo[] };

export type Skippable = {
  annotations: Annotation[];
  configs?: string[];
  prefix?: string;
  name?: string;
  offset?: number;
};

export type Form = { offset: number; form: string };

export type ArgCall = { name: string; offset: number; open: number; close: number; args: string[] };

export type Receiver = { start: number; end: number; text: string };

export type CallKind = 'assert' | 'skip' | 'fail';

export type FoundCall = { name: string; kind: CallKind; offset: number };

export type DroppedCall = { name: string; start: number; end: number };

export type DispatchKind = 'real' | 'virtual' | 'unknown' | 'inherit';

export type SchedulerState = DispatchKind | 'blocking';

export type Binding = { text: string; typeOnly: boolean };

export type Bindings = Map<string, Binding[]>;

export type DelayProject = ProjectFlags & { mainReplaced: boolean };

export type Unit = {
  framework: 'junit' | 'kotest' | 'helper';
  symbol: string;
  body: Span;
  configs: string[];
  owner?: { klass: ClassInfo; ancestors: ClassInfo[] } | undefined;
};

export type FileContext = {
  code: string;
  tables: TextTables;
  declarations: Bindings;
  aliases: Set<string>;
  factories: Set<string>;
  syncs: Set<string>;
  pattern: RegExp;
};

export type DelayContext = FileContext & { unit: Unit; project: DelayProject };

export type BodyHost = Host & { open: number; body: Span };

export type ScopeKind = 'test' | 'real';

export type ScopeContext = {
  project: DelayProject;
  declarations: Bindings;
  aliases: Set<string>;
  factories: Set<string>;
  scopes: Map<string, ScopeKind | undefined>;
};

export type SuiteContext = FileContext & {
  project: DelayProject;
  scopes: Map<string, ScopeKind | undefined>;
  teardown: string;
};

export type EscapeContext = SuiteContext & { unit: Unit };

export type BodyContext = EscapeContext & { bodyText: string };

export type ReceiverContext = ScopeContext & {
  code: string;
  tables: TextTables;
  hosts: HostFrame[];
};

export type ScopeReceiver = { kind: ScopeKind; name?: string };

export type Launch = {
  kind: ScopeKind;
  name?: string;
  offset: number;
  after: number;
  builder: string;
  hosts: HostFrame[];
};

export type WaitScope = {
  k: string;
  name?: string | undefined;
  qualified?: string | undefined;
  host?: string | undefined;
  condition?: string | undefined;
  clock?: true | undefined;
  supers: string[];
};

type WaitText = { text: string };

export type WaitFact = {
  line: number;
  name: string;
  qualifier?: string | undefined;
  imported?: string | undefined;
  lambda?: string | undefined;
  statement?: true | undefined;
  arguments: WaitText[];
  outer?: { name?: string | undefined; arguments: WaitText[] } | undefined;
  scopes: WaitScope[];
};

export type WaitFound = { rule: string; kind: string; exemptable: boolean };

export type WaitContext = {
  mockito: boolean;
  awaitility: boolean;
  kotest: boolean;
  playwright: boolean;
  timeUnit: boolean;
  unqualified: boolean;
  shadowed: boolean;
};

export type WaitClassifier = (wait: WaitFact, context: WaitContext) => WaitFound | undefined;

export type SpareContext = {
  file: KotlinFile;
  isProduction: (name: string, file: KotlinFile) => boolean;
  inlineHosts: ReadonlySet<string>;
};

export type WaitOptions = {
  isProduction: SpareContext['isProduction'];
  finding: FindingFactory;
  awaitility: boolean;
  declaredIn?: KotlinFile[];
};
