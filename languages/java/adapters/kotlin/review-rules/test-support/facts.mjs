import { findingFactory } from '../review-finding.mjs';

const MAIN_FILE = 'src/main/kotlin/demo/Sample.kt';
const TEST_FILE = 'src/test/kotlin/demo/SampleTest.kt';

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
    handlers: [],
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
    parameters: [],
    hasBody: true,
    emptyBody: false,
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
  return { text, spread: false, lambda: false, ...overrides };
}

export function call(name, overrides = {}) {
  return { name, positional: 0, named: [], spread: false, lambda: false, ...overrides };
}

export function wait(name, overrides = {}) {
  return {
    line: 5,
    name,
    qualifier: name === 'sleep' ? 'Thread' : undefined,
    arguments: [argument('100')],
    statement: true,
    scopes: [
      { k: 'fun', name: 'waits' },
      { k: 'class', name: 'SampleTest', qualified: 'SampleTest', supers: [], visibility: 'public' },
    ],
    ...overrides,
  };
}

export function testMethod(name = 'waits') {
  return fn(name, { owner: 'SampleTest', annotations: ['Test'] });
}

export function run(rule, files, options = {}) {
  return rule(files, { finding: findingFactory(), projectRoot: '/nonexistent', ...options });
}

export function summary(findings) {
  return findings.map(({ rule, symbol, location }) => `${rule} ${symbol} ${String(location.line)}`);
}

export function routeOf(message) {
  return message.slice(message.lastIndexOf('If this is intended'));
}

export function routed(message, rule, file = MAIN_FILE) {
  return `${message} If this is intended, add {"rule":"pmd/${rule}","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
}
