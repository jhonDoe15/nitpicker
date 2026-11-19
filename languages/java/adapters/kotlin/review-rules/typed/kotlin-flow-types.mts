export type CoroutineCall = {
  line: number;
  name: string;
  owner?: string;
  function?: string;
  qualifier?: string;
  staticOwner?: string;
  receiverType?: string;
  arguments?: number;
};

export type CoroutineTimeout = {
  line: number;
  builder: string;
  owner?: string;
  function?: string;
  calls: CoroutineCall[];
  references: string[];
  opaqueLoops: number;
};

export type CoroutineFacts = {
  calls?: CoroutineCall[];
  timeouts?: CoroutineTimeout[];
};

export type BlockingResolver = {
  resolve: (name: string) => string[];
  isType: (name: string | undefined, qualified: string) => boolean;
  importsFrom: (prefix: string) => boolean;
};

export type BlockingProject = {
  declared: Set<string>;
  suspending: Set<string>;
  plain: Set<string>;
  nonBlocking: Set<string>;
  constructors: Set<string>;
  isBlockingRepository: (resolver: BlockingResolver, type: string) => boolean;
  declares: (name: string) => boolean;
};

export type BlockingClassification = { subject: string; basis: string };

export type CleanupCall = {
  section: string;
  line: number;
  name: string;
  owner?: string;
  function: string;
  qualifier?: string;
  receiver?: string;
  receiverType?: string;
  calleeType?: string;
  context?: string;
};

export type UseLaunch = {
  line: number;
  launch: string;
  resource: string;
  opened: string;
  owner?: string;
  function: string;
  scope?: string;
  scopeType?: string;
  implicit?: string;
};

export type ImportResolver = {
  (local: string, qualified: string): boolean;
  realName: (local: string) => string;
};

export type HandlerFact = {
  line: number;
  type: string;
  symbol: string;
  interrupt: boolean;
  cancellation: boolean;
};

export type PredicateComparison = {
  left: string;
  right: string;
  leftStable: boolean;
  rightStable: boolean;
};

export type PredicateFact = {
  line: number;
  symbol: string;
  holder: string;
  kind: string;
  subject: string;
  subjectStable: boolean;
  comparisons: PredicateComparison[];
  elements: string[];
};

export type ChainSegment = {
  name?: string;
  call?: true;
  opaque?: true;
  arguments?: { text: string }[];
};

export type BindingFact = {
  name: string;
  owner: string;
  local: boolean;
  init?: ChainSegment[];
  type?: string;
};

type LoadContext = {
  kind: string;
  owner: string;
  member: string;
  site?: string;
};

export type LoadFact = {
  line: number;
  name: string;
  text: string;
  call?: true;
  receiver: ChainSegment[];
  arguments?: { text: string }[];
  context: LoadContext;
};
