import { findingFactory } from '../review-finding.mjs';

export const MAIN_FILE = 'src/main/kotlin/demo/Sample.kt';
export const TEST_FILE = 'src/test/kotlin/demo/SampleTest.kt';

export function file(overrides = {}) {
  return {
    file: MAIN_FILE,
    test: false,
    package: 'demo',
    imports: [],
    classes: [],
    functions: [],
    properties: [],
    waits: [],
    predicates: [],
    calls: [],
    references: [],
    ...overrides,
  };
}

export function testFile(overrides = {}) {
  return file({ file: TEST_FILE, test: true, ...overrides });
}

export function klass(name, overrides = {}) {
  return {
    name,
    qualified: name,
    kind: 'class',
    line: 1,
    data: false,
    open: false,
    local: false,
    visibility: 'public',
    constructorVisibility: 'public',
    annotations: [],
    supers: [],
    superCall: false,
    primaryParameters: [],
    entries: [],
    ...overrides,
  };
}

export function parameter(name, type = 'Int', overrides = {}) {
  return {
    name,
    type,
    vararg: false,
    default: false,
    property: null,
    line: 1,
    annotations: [],
    ...overrides,
  };
}

export function fn(name, overrides = {}) {
  return {
    name,
    line: 1,
    owner: '',
    local: false,
    visibility: 'public',
    modifiers: [],
    annotations: [],
    typeParameters: false,
    receiver: null,
    returnType: null,
    parameters: [],
    hasBody: true,
    emptyBody: false,
    forward: null,
    ...overrides,
  };
}

export function property(name, owner, overrides = {}) {
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

export function argument(text, overrides = {}) {
  return { name: null, text, spread: false, lambda: false, ...overrides };
}

export function call(name, overrides = {}) {
  return { name, positional: 0, named: [], spread: false, lambda: false, ...overrides };
}

export function wait(name, overrides = {}) {
  return {
    line: 5,
    name,
    qualifier: name === 'sleep' ? 'Thread' : null,
    arguments: [argument('100')],
    lambda: null,
    statement: true,
    outer: null,
    scopes: [
      { k: 'fun', name: 'waits' },
      { k: 'class', name: 'SampleTest', qualified: 'SampleTest', supers: [], visibility: 'public' },
    ],
    ...overrides,
  };
}

export const testMethod = (name = 'waits') =>
  fn(name, { owner: 'SampleTest', annotations: ['Test'] });

export function run(rule, files, options = {}) {
  return rule(files, { finding: findingFactory(), projectRoot: '/nonexistent', ...options });
}

export const summary = (findings) =>
  findings.map(({ rule, symbol, location }) => `${rule} ${symbol} ${String(location.line)}`);
