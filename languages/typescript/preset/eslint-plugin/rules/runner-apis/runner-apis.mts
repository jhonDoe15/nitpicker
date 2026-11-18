import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, requiredLiteral } from '../typed/node-views.mts';
import { memberName } from '../analysis/test-code-analysis.mts';

type ImportSpec = {
  readonly matches: (source: string) => boolean;
  readonly names: readonly string[];
  readonly kind: string;
  readonly functions?: readonly string[];
};
type Binding = { readonly local: string; readonly kind: string; readonly method?: string };
export type CalledMethod = {
  readonly kind: string | undefined;
  readonly method?: string | undefined;
};
export type RunnerApis = {
  readonly kinds: Map<string, string>;
  readonly functions: Map<string, { readonly kind: string; readonly method: string }>;
};
type Specifier = TSESTree.ImportDeclaration['specifiers'][number];
type Visitors = {
  readonly ImportDeclaration: (node: TSESTree.ImportDeclaration) => void;
  readonly VariableDeclarator: (node: TSESTree.VariableDeclarator) => void;
  readonly AssignmentExpression: (node: TSESTree.AssignmentExpression) => void;
};

const WITH_GLOBAL = 'withGlobal';
const SINON = 'sinon';
const DEFAULT_NAME = 'default';
const VITEST = 'vitest';
const CLOCK = 'clock';

const GLOBAL_KINDS: readonly (readonly [string, string])[] = [
  ['vi', VITEST],
  [VITEST, VITEST],
  ['jest', 'jest'],
  [SINON, SINON],
];

const WHOLE_MODULE = [DEFAULT_NAME, '*'];

const IMPORTS: readonly ImportSpec[] = [
  { matches: (source) => source === VITEST, names: ['vi', VITEST], kind: VITEST },
  { matches: (source) => source === '@jest/globals', names: ['jest'], kind: 'jest' },
  { matches: (source) => source === 'node:test', names: ['mock'], kind: 'node' },
  {
    matches: (source) => source.startsWith('@testing-library/'),
    names: ['waitFor'],
    kind: 'waitFor',
  },
  { matches: (source) => source === 'mock-require', names: [DEFAULT_NAME], kind: 'mockRequire' },
  { matches: (source) => source === 'testdouble', names: WHOLE_MODULE, kind: 'testdouble' },
  { matches: (source) => source === 'quibble', names: [DEFAULT_NAME], kind: 'quibble' },
  {
    matches: (source) => source === SINON,
    names: WHOLE_MODULE,
    kind: SINON,
    functions: [
      'useFakeTimers',
      'createSandbox',
      'restore',
      'stub',
      'spy',
      'replace',
      'replaceGetter',
      'replaceSetter',
    ],
  },
  {
    matches: (source) => source === '@sinonjs/fake-timers',
    names: WHOLE_MODULE,
    kind: 'fakeTimers',
    functions: ['install', 'createClock', WITH_GLOBAL],
  },
  {
    matches: (source) => source === 'proxyquire',
    names: [DEFAULT_NAME],
    kind: 'proxyquire',
  },
  { matches: (source) => source === 'esmock', names: [DEFAULT_NAME], kind: 'esmock' },
];

const CHAINED_KINDS: ReadonlySet<string> = new Set(['proxyquire']);

const PRODUCED_KINDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  sinon: { createSandbox: SINON, useFakeTimers: CLOCK },
  fakeTimers: { install: CLOCK, createClock: CLOCK },
};

function importedName(specifier: Specifier): string {
  if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    return DEFAULT_NAME;
  }
  if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
    return '*';
  }
  const { imported } = specifier;
  return imported.type === AST_NODE_TYPES.Identifier ? imported.name : imported.value;
}

function bindingOf(spec: ImportSpec, name: string, local: string): Binding[] {
  if (spec.names.includes(name)) {
    return [{ local, kind: spec.kind }];
  }
  return spec.functions?.includes(name) === true ? [{ local, kind: spec.kind, method: name }] : [];
}

function importBindings(node: TSESTree.ImportDeclaration, spec: ImportSpec): Binding[] {
  return node.specifiers.flatMap((specifier) =>
    bindingOf(spec, importedName(specifier), specifier.local.name),
  );
}

function chainedRequire(init: TSESTree.Node | undefined): TSESTree.Node | undefined {
  if (init?.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const steps = chainOf<TSESTree.Node>(init, (current) =>
    current.type === AST_NODE_TYPES.CallExpression &&
    current.callee.type === AST_NODE_TYPES.MemberExpression
      ? current.callee.object
      : undefined,
  );
  return steps.at(-1);
}

function requireSource(init: TSESTree.Node | undefined): string | undefined {
  const source = requiredLiteral(init);
  return typeof source === 'string' ? source : undefined;
}

function destructuredBindings(pattern: TSESTree.ObjectPattern, spec: ImportSpec): Binding[] {
  return pattern.properties
    .filter((property) => property.type === AST_NODE_TYPES.Property)
    .flatMap((property) =>
      property.key.type === AST_NODE_TYPES.Identifier &&
      property.value.type === AST_NODE_TYPES.Identifier
        ? bindingOf(spec, property.key.name, property.value.name)
        : [],
    );
}

function requireBindings(declarator: TSESTree.VariableDeclarator, spec: ImportSpec): Binding[] {
  const { id } = declarator;
  if (id.type === AST_NODE_TYPES.ObjectPattern) {
    return destructuredBindings(id, spec);
  }
  return id.type === AST_NODE_TYPES.Identifier && spec.names.includes(DEFAULT_NAME)
    ? [{ local: id.name, kind: spec.kind }]
    : [];
}

function specFor(source: string | undefined): ImportSpec | undefined {
  return source === undefined ? undefined : IMPORTS.find(({ matches }) => matches(source));
}

function requiredSpec(init: TSESTree.Node | undefined): ImportSpec | undefined {
  const direct = specFor(requireSource(init));
  if (direct !== undefined) {
    return direct;
  }
  const chained = specFor(requireSource(chainedRequire(init)));
  return chained !== undefined && CHAINED_KINDS.has(chained.kind) ? chained : undefined;
}

export function createRunnerApis(): RunnerApis {
  return { kinds: new Map(GLOBAL_KINDS), functions: new Map() };
}

function remember(apis: RunnerApis, bindings: readonly Binding[]): void {
  for (const { local, kind, method } of bindings) {
    if (method === undefined) {
      apis.kinds.set(local, kind);
    } else {
      apis.functions.set(local, { kind, method });
    }
  }
}

function importedFunction(
  apis: RunnerApis,
  callee: TSESTree.Node,
): { readonly kind: string; readonly method: string } | undefined {
  return callee.type === AST_NODE_TYPES.Identifier ? apis.functions.get(callee.name) : undefined;
}

export function calledMethod(apis: RunnerApis, callee: TSESTree.Node): CalledMethod | undefined {
  const imported = importedFunction(apis, callee);
  if (imported !== undefined) {
    return imported;
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  return { kind: kindOfObject(apis, callee.object), method: memberName(callee) };
}

export { memberName as propertyName };

function bindingKey(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  const isThisMember =
    node?.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.ThisExpression;
  const name = isThisMember ? memberName(node) : undefined;
  return name === undefined ? undefined : `this.${name}`;
}

function producedObjectKind(
  apis: RunnerApis,
  { callee }: TSESTree.CallExpression,
): string | undefined {
  const imported = importedFunction(apis, callee);
  const isWithGlobal =
    imported === undefined
      ? memberName(callee) === WITH_GLOBAL &&
        callee.type === AST_NODE_TYPES.MemberExpression &&
        apis.kinds.get(bindingKey(callee.object) ?? '') === 'fakeTimers'
      : imported.kind === 'fakeTimers' && imported.method === WITH_GLOBAL;
  return isWithGlobal ? 'fakeTimers' : undefined;
}

export function kindOfObject(apis: RunnerApis, node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return producedObjectKind(apis, node);
  }
  const kind = apis.kinds.get(bindingKey(node) ?? '');
  if (kind !== undefined || node.type === AST_NODE_TYPES.Identifier) {
    return kind;
  }
  return memberName(node) === 'mock' ? 'node' : undefined;
}

function producedKind(apis: RunnerApis, value: TSESTree.Node | undefined): string | undefined {
  const called =
    value?.type === AST_NODE_TYPES.CallExpression ? calledMethod(apis, value.callee) : undefined;
  if (called?.kind === undefined) {
    return undefined;
  }
  const produced = PRODUCED_KINDS[called.kind];
  return produced === undefined ? undefined : produced[called.method ?? ''];
}

function rememberProduced(
  apis: RunnerApis,
  target: TSESTree.Node,
  value: TSESTree.Node | undefined,
): void {
  const key = bindingKey(target);
  const kind = key === undefined ? undefined : producedKind(apis, value);
  if (key !== undefined && kind !== undefined) {
    apis.kinds.set(key, kind);
  }
}

export function runnerApiVisitors(apis: RunnerApis): Visitors {
  return {
    ImportDeclaration(node) {
      const spec = specFor(node.source.value);
      if (spec !== undefined && node.importKind !== 'type') {
        remember(apis, importBindings(node, spec));
      }
    },
    VariableDeclarator(node) {
      const spec = requiredSpec(node.init ?? undefined);
      if (spec !== undefined) {
        remember(apis, requireBindings(node, spec));
      }
      rememberProduced(apis, node.id, node.init ?? undefined);
    },
    AssignmentExpression(node) {
      rememberProduced(apis, node.left, node.right);
    },
  };
}

export function runnerApisOf(program: TSESTree.Program): RunnerApis {
  const apis = createRunnerApis();
  const visitors = runnerApiVisitors(apis);
  const declarators = program.body
    .filter((statement) => statement.type === AST_NODE_TYPES.VariableDeclaration)
    .flatMap((statement) => statement.declarations);
  for (const statement of program.body.filter(
    (each) => each.type === AST_NODE_TYPES.ImportDeclaration,
  )) {
    visitors.ImportDeclaration(statement);
  }
  for (const declarator of declarators) {
    visitors.VariableDeclarator(declarator);
  }
  return apis;
}
