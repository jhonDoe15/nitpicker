import { findingFactory } from '../review-finding.mts';
import { listOf } from '../../../../../../shared/values/readers.mts';

const MAIN_FILE = 'src/main/kotlin/demo/Sample.kt';
const PUBLIC = 'public';
const SAMPLE_TEST = 'SampleTest';
const TEST_FILE = 'src/test/kotlin/demo/SampleTest.kt';

type Fact = Record<string, unknown>;

export type ImportFact = {
  path: string;
  alias: string | undefined;
  all: boolean;
};

export type ParameterFact = {
  name: string;
  type: string;
  vararg: boolean;
  default: boolean;
  line: number;
  annotations: string[];
};

export type ClassFact = {
  name: string;
  qualified: string;
  kind: string;
  line: number;
  data: boolean;
  open: boolean;
  local: boolean;
  visibility: string;
  constructorVisibility: string;
  annotations: string[];
  supers: string[];
  superCall: boolean;
  primaryParameters: ParameterFact[];
  entries: Fact[];
};

export type FunctionFact = {
  name: string;
  line: number;
  owner: string;
  local: boolean;
  visibility: string;
  modifiers: string[];
  annotations: string[];
  typeParameters: boolean;
  parameters: ParameterFact[];
  hasBody: boolean;
  emptyBody: boolean;
};

export type PropertyFact = {
  name: string;
  line: number;
  owner: string;
  type: string;
  var: boolean;
  lateinit: boolean;
  delegated: boolean;
  annotations: string[];
};

export type ArgumentFact = {
  text: string;
  spread: boolean;
  lambda: boolean;
};

export type CallFact = {
  name: string;
  positional: number;
  named: string[];
  spread: boolean;
  lambda: boolean;
};

export type SegmentFact = {
  name: string;
  call: boolean;
  arguments?: Fact[];
};

export type LoadedFact = {
  line: number;
  name: string;
  call: boolean;
  receiver: SegmentFact[];
  arguments: Fact[];
  text: string;
  context: Fact;
};

export type WaitFact = {
  line: number;
  name: string;
  qualifier: string | undefined;
  arguments: ArgumentFact[];
  statement: boolean;
  scopes: Fact[];
};

export type FileFacts = {
  file: string;
  test: boolean;
  package: string;
  imports: ImportFact[];
  classes: ClassFact[];
  functions: FunctionFact[];
  properties: PropertyFact[];
  waits: WaitFact[];
  timeouts: Fact[];
  predicates: Fact[];
  handlers: Fact[];
  calls: CallFact[];
  references: Fact[];
  lookups: Fact[];
  typed: Fact[];
  loads: LoadedFact[];
  bindings: Fact[];
};

export type RuleFinding = {
  tool: string;
  rule: string;
  path: string;
  identity: string;
  symbol: string;
  location: { line: number };
  message: string;
  allowedForm?: string;
  classification: string;
};

export type CleanupCallFact = {
  section: string;
  line: number;
  name: string;
  owner: string;
  function: string;
};

export type UseLaunchFact = {
  line: number;
  launch: string;
  resource: string;
  opened: string;
  owner: string;
  function: string;
  scope: string;
  scopeType: string;
};

const makeFinding: () => unknown = findingFactory;

function isFinding(value: unknown): value is RuleFinding {
  return typeof value === 'object' && value !== null && 'rule' in value;
}

export function file(overrides: Partial<FileFacts> = {}): FileFacts {
  return {
    file: MAIN_FILE,
    test: false,
    package: 'demo',
    imports: [],
    classes: [],
    functions: [],
    properties: [],
    waits: [],
    timeouts: [],
    predicates: [],
    handlers: [],
    calls: [],
    references: [],
    lookups: [],
    typed: [],
    loads: [],
    bindings: [],
    ...overrides,
  };
}

export function testFile(overrides: Partial<FileFacts> = {}): FileFacts {
  return file({ file: TEST_FILE, test: true, ...overrides });
}

export function klass(name: string, overrides: Partial<ClassFact> = {}): ClassFact {
  return {
    name,
    qualified: name,
    kind: 'class',
    line: 1,
    data: false,
    open: false,
    local: false,
    visibility: PUBLIC,
    constructorVisibility: PUBLIC,
    annotations: [],
    supers: [],
    superCall: false,
    primaryParameters: [],
    entries: [],
    ...overrides,
  };
}

export function parameter(
  name: string,
  type = 'Int',
  overrides: Partial<ParameterFact> = {},
): ParameterFact {
  return {
    name,
    type,
    vararg: false,
    default: false,
    line: 1,
    annotations: [],
    ...overrides,
  };
}

export function fn(name: string, overrides: Partial<FunctionFact> = {}): FunctionFact {
  return {
    name,
    line: 1,
    owner: '',
    local: false,
    visibility: PUBLIC,
    modifiers: [],
    annotations: [],
    typeParameters: false,
    parameters: [],
    hasBody: true,
    emptyBody: false,
    ...overrides,
  };
}

export function property(
  name: string,
  owner: string,
  overrides: Partial<PropertyFact> = {},
): PropertyFact {
  return {
    name,
    line: 1,
    owner,
    type: 'String',
    var: false,
    lateinit: false,
    delegated: false,
    annotations: [],
    ...overrides,
  };
}

export function argument(text: string, overrides: Partial<ArgumentFact> = {}): ArgumentFact {
  return { text, spread: false, lambda: false, ...overrides };
}

export function call(name: string, overrides: Partial<CallFact> = {}): CallFact {
  return { name, positional: 0, named: [], spread: false, lambda: false, ...overrides };
}

export function segment(name: string, options: { call?: true; args?: Fact[] } = {}): SegmentFact {
  const { call = false, args = [] } = options;
  return call ? { name, call, arguments: args } : { name, call };
}

export function loaded(
  text: string,
  context: Fact,
  overrides: Partial<LoadedFact> = {},
): LoadedFact {
  return {
    line: 3,
    name: text,
    call: true,
    receiver: [],
    arguments: [],
    text: `${text}()`,
    context: { kind: 'file', owner: '', member: 'value', ...context },
    ...overrides,
  };
}

export function wait(name: string, overrides: Partial<WaitFact> = {}): WaitFact {
  return {
    line: 5,
    name,
    qualifier: name === 'sleep' ? 'Thread' : undefined,
    arguments: [argument('100')],
    statement: true,
    scopes: [
      { k: 'fun', name: 'waits' },
      { k: 'class', name: SAMPLE_TEST, qualified: SAMPLE_TEST, supers: [], visibility: PUBLIC },
    ],
    ...overrides,
  };
}

export function testMethod(name = 'waits'): FunctionFact {
  return fn(name, { owner: SAMPLE_TEST, annotations: ['Test'] });
}

export function run(
  rule: (files: never, options: never) => unknown,
  files: FileFacts[],
  options: Fact = {},
): RuleFinding[] {
  const found: unknown = Reflect.apply(rule, undefined, [
    files,
    { finding: makeFinding(), projectRoot: '/nonexistent', ...options },
  ]);
  const findings = listOf(found);
  if (!(Array.isArray(found) && findings.every(isFinding))) {
    throw new Error('the rule did not return a list of findings');
  }
  return findings.filter(isFinding);
}

export function summary(findings: RuleFinding[]): string[] {
  return findings.map(({ rule, symbol, location }) => `${rule} ${symbol} ${String(location.line)}`);
}

export function routeOf(message: string): string {
  return message.slice(message.lastIndexOf('If this is intended'));
}

export function routed(message: string, rule: string, file = MAIN_FILE, tool = 'pmd'): string {
  return `${message} If this is intended, add {"rule":"${tool}/${rule}","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
}

export function sourceRouted(message: string, rule: string): string {
  return routed(message, rule, MAIN_FILE, 'kotlin-source');
}

export function importOf(path: string, overrides: Partial<ImportFact> = {}): ImportFact {
  return { path, alias: undefined, all: false, ...overrides };
}

export function cleanupCall(
  name: string,
  overrides: Partial<CleanupCallFact> = {},
): CleanupCallFact {
  return { section: 'finally', line: 7, name, owner: 'Store', function: 'close', ...overrides };
}

export function useLaunch(overrides: Partial<UseLaunchFact> = {}): UseLaunchFact {
  return {
    line: 9,
    launch: 'launch',
    resource: 'reader',
    opened: 'source',
    owner: 'Store',
    function: 'copy',
    scope: 'scope',
    scopeType: 'CoroutineScope',
    ...overrides,
  };
}
