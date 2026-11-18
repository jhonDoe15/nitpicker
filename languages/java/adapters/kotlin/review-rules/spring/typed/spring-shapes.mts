import type {
  Annotation,
  Argument,
  ClassFact,
  FunctionFact,
  InvocationFact,
  LocalFact,
  ExceptionUse,
  ParameterFact,
  PropertyFact,
  ScopeFact,
  ScopeParameter,
  SpringFile,
} from './spring-facts.mts';

export type Source = { text: string; code: string };
export type Section = { inner?: string; end: number };
export type Selector = {
  name: string;
  call: boolean;
  typeArguments: string | undefined;
  arguments: Argument[];
};
export type LambdaParts = { params: string[]; body: string };

export type Super = { name: string; exact: boolean };
export type NamedAnnotation = { resolve: Resolve; name: string };
export type ContextInput = {
  projectFiles: SourceFile[];
  declared: Set<string>;
  projectRoot: string;
  javaRoots: string[];
};

export type Call = {
  name: string;
  typeArguments?: string | undefined;
  arguments: Argument[];
};
export type CallSite = { id: number | undefined; call: Call; head?: string | undefined };

export type Transform = {
  (type: string | undefined): string | undefined;
  total?: true;
};
export type StepNext = { id: number | undefined; text: string | undefined };
export type Step = { type?: string | undefined; next?: StepNext; then?: Transform };
export type Request = { id: number | undefined; text: string | undefined; then: Transform[] };

export type { Import } from './spring-facts.mts';

export type Fqns = ReadonlySet<string>;
export type Resolve = (name: string) => string[];

type SourceInvocation = Omit<InvocationFact, 'arguments'> & { arguments?: Argument[] };
export type SourceFile = Omit<SpringFile, 'invocations' | 'scopes'> & {
  invocations: SourceInvocation[];
  scopes?: ScopeFact[] | undefined;
};
export type ViewableFile = SourceFile & { scopes: ScopeFact[] };

export type ProjectClass = { file: SourceFile; declared: ClassFact };
export type Member = ParameterFact | PropertyFact;
export type Annotated = {
  name: string;
  line: number;
  annotationEntries?: Annotation[] | undefined;
  type?: string | undefined;
  initializer?: string | undefined;
};
export type Declaration = { line: number; annotationEntries?: Annotation[] | undefined };

export type ProjectContext = {
  projectFiles: SourceFile[];
  classes: Map<string, ProjectClass>;
  resolvers: Map<SourceFile, Resolve>;
  declared: Set<string>;
  projectRoot: string;
  javaRoots: string[];
  javaSource: (qualified: string) => string | undefined;
  converted: () => Set<string | undefined>;
  advised: () => Set<string>;
  reachCache: (targets: Fqns) => Map<string, boolean>;
};

export type ScopedView = {
  resolve: Resolve;
  projectClass: (text: string) => ProjectClass | undefined;
  metaAnnotated: (text: string, fqns: Fqns) => boolean;
};

export type Receiver = { text?: string; scope?: number | undefined; type?: string };

export type SpringView = {
  file: SpringFile;
  resolve: Resolve;
  declared: Set<string>;
  chain: (id: number | undefined) => ScopeFact[];
  classes: Map<string, ClassFact>;
  is: (text: string | undefined, fqns: Fqns) => boolean;
  scopedTo: (other: SourceFile) => ScopedView;
  isRepository: (text: string) => boolean;
  extendsType: (text: string, fqns: Fqns) => boolean;
  projectClass: (text: string) => ProjectClass | undefined;
  projectFunctions: (text: string, name: string) => FunctionFact[];
  isJavaEnum: (candidates: string[]) => boolean;
  javaConverted: () => Set<string | undefined>;
  metaAnnotated: (text: string, fqns: Fqns) => boolean;
  advised: () => Set<string>;
  functionOf: (scope: ScopeFact | undefined) => FunctionFact | undefined;
  functionsOf: (qualified: string) => FunctionFact[];
  propertiesOf: (qualified: string) => PropertyFact[];
  memberPropertiesOf: (qualified: string | undefined) => PropertyFact[];
  memberTypeOf: (ownerType: string, member: string) => string | undefined;
  functionAt: (id: number | undefined) => FunctionFact | undefined;
  classAt: (id: number | undefined) => ClassFact | undefined;
  typeOf: (id: number | undefined, text: string | undefined) => string | undefined;
  receiverOf: (invocation: InvocationFact) => Receiver | undefined;
  declaresLocally: (id: number | undefined, name: string) => boolean;
  implicitReceiver: (id: number | undefined) => Receiver | undefined;
};

export type AllOpen = { annotations?: string[] | undefined; presets?: string[] | undefined };

export type RuleOptions = {
  allOpen?: AllOpen | undefined;
  projectFiles: SourceFile[];
  checksForeignKeys?: ((file: string) => boolean) | undefined;
  allowsSequenceIds?: ((file: string) => boolean) | undefined;
};

export type Reported = { rule: string; line: number; symbol: string; key?: string };

export type SpringRule = (view: SpringView, options: RuleOptions) => Reported[];

export type ViewInput = {
  files: SourceFile[];
  projectFiles: SourceFile[];
  projectRoot: string;
  javaRoots?: string[] | undefined;
};

export type {
  Annotation,
  Argument,
  ClassFact,
  FunctionFact,
  InvocationFact,
  LocalFact,
  ExceptionUse,
  ParameterFact,
  PropertyFact,
  ScopeFact,
  ScopeParameter,
};
