import type {
  Annotation,
  Argument,
  ClassFact as SpringClass,
  FunctionFact as SpringFunction,
  Import,
  InvocationFact as SpringInvocation,
  ParameterFact as SpringParameter,
  PropertyFact as SpringProperty,
  ScopeFact as SpringScope,
  SpringFile,
} from '../spring/typed/spring-facts.mts';
import type { TopLevelProperty, UpdateFact } from '../main/suspension/suspension-types.mts';
import type { TimeoutEntry } from '../main/timeouts/timeout-types.mts';
import type { LookupFact, TypedFact } from '../main/service-lookups/lookup-types.mts';
import type { CallFact } from '../main/unused-options/unused-option-types.mts';
import type { FieldWrite, LockAcquisition, LockedCall } from '../main/locking/locking-types.mts';
import type {
  BindingFact,
  CleanupCall,
  CoroutineFacts,
  HandlerFact,
  LoadFact,
  PredicateFact,
  UseLaunch,
} from './kotlin-flow-types.mts';

export type ArgumentFact = Argument;

export type AnnotationEntry = Annotation & { target?: string };

export type ImportFact = Import;

export type ParameterFact = Omit<SpringParameter, 'annotationEntries'> & {
  annotationEntries?: AnnotationEntry[] | undefined;
  annotations?: string[];
  visibility?: string;
};

export type ClassFact = Omit<SpringClass, 'primaryParameters'> & {
  primaryParameters: ParameterFact[];
  start?: number;
  headerEnd?: number;
  init: boolean;
  serializable: boolean;
  local: boolean;
  constructorVisibility?: string;
  superCall: boolean;
  entries?: string[];
};

type ForwardFact = {
  name: string;
  qualifier?: string | undefined;
  typeArguments: boolean;
  arguments: ArgumentFact[];
  typeArgumentList?: string | undefined;
};

export type FunctionFact = Omit<SpringFunction, 'forward' | 'parameters'> & {
  parameters: ParameterFact[];
  forward?: ForwardFact | undefined;
  start?: number;
  end?: number;
  class?: string;
  suspend: boolean;
  inline: boolean;
  shielded?: true;
  returnsUnit: boolean;
  staticIn?: string;
  local: boolean;
  annotations?: string[];
  typeParameters: boolean;
  emptyBody: boolean;
};

type PropertyFact = SpringProperty & {
  lateinit: boolean;
  annotations?: string[];
  argument?: string;
};

export type ScopeFact = SpringScope & {
  visibility?: string;
  collection?: {
    root: string;
    links?: { name: string; arguments?: ArgumentFact[] }[];
    range?: { operator: string; from: string; to: string };
  };
  condition?: string;
  clock?: true;
  topLevel?: true;
  annotations?: string[];
  parameters?: { type: string; vararg: boolean }[];
  frameId?: number;
  object?: true;
  receiver?: string;
  supers?: string[];
};

export type InvocationFact = SpringInvocation & {
  returned: boolean;
  statement?: true;
  result?: true;
  elvis?: string;
  branch?: true;
  guarded: boolean;
  safe?: true;
  throwing?: true;
};

export type KotlinFile = Omit<
  SpringFile,
  'classes' | 'functions' | 'properties' | 'scopes' | 'invocations'
> & {
  classes: ClassFact[];
  functions: FunctionFact[];
  properties: PropertyFact[];
  scopes: ScopeFact[];
  invocations: InvocationFact[];
  lines?: number;
  skipped?: true;
  calls: CallFact[];
  references: string[];
  typeAliases?: { name: string; target: string }[];
  handlers?: HandlerFact[];
  loads?: LoadFact[];
  lockAcquisitions?: LockAcquisition[];
  fieldWrites?: FieldWrite[];
  lockedCalls?: LockedCall[];
  lockHosts?: Record<string, string>;
  bindings?: BindingFact[];
  lookups?: LookupFact[];
  timeouts?: TimeoutEntry[];
  updates?: UpdateFact[];
  topLevelProperties?: TopLevelProperty[];
  typed?: TypedFact[];
  predicates?: PredicateFact[];
  coroutines?: CoroutineFacts;
  cleanupCalls?: CleanupCall[];
  useLaunches?: UseLaunch[];
  [field: string]: unknown;
};
