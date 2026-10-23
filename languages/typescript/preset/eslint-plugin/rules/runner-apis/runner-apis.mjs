import { chainOf } from '../analysis/ancestry.mjs';

const GLOBAL_KINDS = [
  ['vi', 'vitest'],
  ['vitest', 'vitest'],
  ['jest', 'jest'],
  ['sinon', 'sinon'],
];

const WHOLE_MODULE = ['default', '*'];

const IMPORTS = [
  { matches: (source) => source === 'vitest', names: ['vi', 'vitest'], kind: 'vitest' },
  { matches: (source) => source === '@jest/globals', names: ['jest'], kind: 'jest' },
  { matches: (source) => source === 'node:test', names: ['mock'], kind: 'node' },
  {
    matches: (source) => source.startsWith('@testing-library/'),
    names: ['waitFor'],
    kind: 'waitFor',
  },
  { matches: (source) => source === 'mock-require', names: ['default'], kind: 'mockRequire' },
  { matches: (source) => source === 'testdouble', names: WHOLE_MODULE, kind: 'testdouble' },
  { matches: (source) => source === 'quibble', names: ['default'], kind: 'quibble' },
  {
    matches: (source) => source === 'sinon',
    names: WHOLE_MODULE,
    kind: 'sinon',
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
    functions: ['install', 'createClock', 'withGlobal'],
  },
  {
    matches: (source) => source === 'proxyquire',
    names: ['default'],
    kind: 'proxyquire',
    chained: true,
  },
  { matches: (source) => source === 'esmock', names: ['default'], kind: 'esmock' },
];

const PRODUCED_KINDS = {
  sinon: { createSandbox: 'sinon', useFakeTimers: 'clock' },
  fakeTimers: { install: 'clock', createClock: 'clock' },
};

function importedName(specifier) {
  if (specifier.type === 'ImportDefaultSpecifier') {
    return 'default';
  }
  if (specifier.type === 'ImportNamespaceSpecifier') {
    return '*';
  }
  const { imported } = specifier;
  return imported.type === 'Identifier' ? imported.name : imported.value;
}

function bindingOf(spec, name, local) {
  if (spec.names.includes(name)) {
    return [{ local, kind: spec.kind }];
  }
  return spec.functions?.includes(name) ? [{ local, kind: spec.kind, method: name }] : [];
}

function importBindings(node, spec) {
  return node.specifiers.flatMap((specifier) =>
    bindingOf(spec, importedName(specifier), specifier.local.name),
  );
}

function chainedRequire(init) {
  if (init?.type !== 'CallExpression') {
    return undefined;
  }
  const steps = chainOf(init, (current) =>
    current.type === 'CallExpression' && current.callee.type === 'MemberExpression'
      ? current.callee.object
      : undefined,
  );
  return steps.at(-1);
}

function requireSource(init) {
  const isRequire =
    init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    init.callee.name === 'require' &&
    typeof init.arguments[0]?.value === 'string';
  return isRequire ? init.arguments[0].value : undefined;
}

function destructuredBindings(pattern, spec) {
  return pattern.properties
    .filter(
      (property) =>
        property.type === 'Property' &&
        property.key.type === 'Identifier' &&
        property.value.type === 'Identifier',
    )
    .flatMap((property) => bindingOf(spec, property.key.name, property.value.name));
}

function requireBindings(declarator, spec) {
  const { id } = declarator;
  if (id.type === 'ObjectPattern') {
    return destructuredBindings(id, spec);
  }
  return id.type === 'Identifier' && spec.names.includes('default')
    ? [{ local: id.name, kind: spec.kind }]
    : [];
}

function specFor(source) {
  return source === undefined ? undefined : IMPORTS.find(({ matches }) => matches(source));
}

function requiredSpec(init) {
  const direct = specFor(requireSource(init));
  if (direct !== undefined) {
    return direct;
  }
  const chained = specFor(requireSource(chainedRequire(init)));
  return chained?.chained === true ? chained : undefined;
}

export function createRunnerApis() {
  return { kinds: new Map(GLOBAL_KINDS), functions: new Map() };
}

function remember(apis, bindings) {
  for (const { local, kind, method } of bindings) {
    if (method === undefined) {
      apis.kinds.set(local, kind);
    } else {
      apis.functions.set(local, { kind, method });
    }
  }
}

function importedFunction(apis, callee) {
  return callee.type === 'Identifier' ? apis.functions.get(callee.name) : undefined;
}

export function calledMethod(apis, callee) {
  const imported = importedFunction(apis, callee);
  if (imported !== undefined) {
    return imported;
  }
  if (callee.type !== 'MemberExpression') {
    return undefined;
  }
  return { kind: kindOfObject(apis, callee.object), method: propertyName(callee) };
}

export function propertyName(callee) {
  if (callee.type !== 'MemberExpression') {
    return undefined;
  }
  const { property } = callee;
  if (!callee.computed) {
    return property.type === 'Identifier' ? property.name : undefined;
  }
  return property.type === 'Literal' && typeof property.value === 'string'
    ? property.value
    : undefined;
}

function bindingKey(node) {
  if (node?.type === 'Identifier') {
    return node.name;
  }
  const isThisMember = node?.type === 'MemberExpression' && node.object.type === 'ThisExpression';
  const name = isThisMember ? propertyName(node) : undefined;
  return name === undefined ? undefined : `this.${name}`;
}

function producedObjectKind(apis, { callee }) {
  const imported = importedFunction(apis, callee);
  const isWithGlobal =
    imported === undefined
      ? propertyName(callee) === 'withGlobal' &&
        apis.kinds.get(bindingKey(callee.object) ?? '') === 'fakeTimers'
      : imported.kind === 'fakeTimers' && imported.method === 'withGlobal';
  return isWithGlobal ? 'fakeTimers' : undefined;
}

export function kindOfObject(apis, node) {
  if (node.type === 'CallExpression') {
    return producedObjectKind(apis, node);
  }
  const kind = apis.kinds.get(bindingKey(node) ?? '');
  if (kind !== undefined || node.type === 'Identifier') {
    return kind;
  }
  return propertyName(node) === 'mock' ? 'node' : undefined;
}

function producedKind(apis, value) {
  const called = value?.type === 'CallExpression' ? calledMethod(apis, value.callee) : undefined;
  return called === undefined ? undefined : PRODUCED_KINDS[called.kind]?.[called.method ?? ''];
}

function rememberProduced(apis, target, value) {
  const key = bindingKey(target);
  const kind = key === undefined ? undefined : producedKind(apis, value);
  if (kind !== undefined) {
    apis.kinds.set(key, kind);
  }
}

export function runnerApiVisitors(apis) {
  return {
    ImportDeclaration(node) {
      const spec = specFor(node.source.value);
      if (spec !== undefined && node.importKind !== 'type') {
        remember(apis, importBindings(node, spec));
      }
    },
    VariableDeclarator(node) {
      const spec = requiredSpec(node.init);
      if (spec !== undefined) {
        remember(apis, requireBindings(node, spec));
      }
      rememberProduced(apis, node.id, node.init);
    },
    AssignmentExpression(node) {
      rememberProduced(apis, node.left, node.right);
    },
  };
}

export function runnerApisOf(program) {
  const apis = createRunnerApis();
  const visitors = runnerApiVisitors(apis);
  const declarators = program.body
    .filter((statement) => statement.type === 'VariableDeclaration')
    .flatMap((statement) => statement.declarations);
  for (const statement of program.body.filter(({ type }) => type === 'ImportDeclaration')) {
    visitors.ImportDeclaration(statement);
  }
  for (const declarator of declarators) {
    visitors.VariableDeclarator(declarator);
  }
  return apis;
}
