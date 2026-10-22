import { scanKotlinSource } from '../../../scan/kotlin-source.mjs';
import { generatedFile } from '../../../scan/rules/markers.mjs';
import { classesOf, enclosingClasses, functionsOf } from './declarations.mjs';
import { hasNestedRegistration, isSpecType, specBodies, specNodes } from './kotest-specs.mjs';

const JUNIT_TEST_ANNOTATIONS = new Set([
  'Test',
  'ParameterizedTest',
  'RepeatedTest',
  'TestFactory',
  'TestTemplate',
  'Theory',
  'Property',
  'Example',
]);

function junitNode(suite, fn) {
  return {
    framework: 'junit',
    symbol: `${suite.symbol}.${fn.name}`,
    name: fn.name,
    offset: fn.offset,
    annotations: fn.annotations,
    configs: [],
    body: fn.body,
    ancestors: [],
    leaf: true,
    factory: fn.annotations.some(({ name }) => name === 'TestFactory'),
  };
}

function kotestNode(suite, raw) {
  return {
    framework: 'kotest',
    symbol: `${suite.symbol} > ${raw.path.join(' > ')}`,
    name: raw.name,
    prefix: raw.prefix,
    offset: raw.offset,
    annotations: [],
    configs: raw.configs,
    body: raw.body,
    ancestors: raw.ancestors,
    leaf: raw.leaf,
    factory: false,
  };
}

function suiteOf(classes, klass) {
  const ancestors = enclosingClasses(classes, klass.offset);
  return {
    klass,
    ancestors,
    symbol: [...ancestors, klass].map(({ name }) => name).join('.'),
    offset: klass.offset,
    annotations: klass.annotations,
    nodes: [],
  };
}

function withNodes(context, suite) {
  const { scanned, classes, functions } = context;
  const { klass } = suite;
  const junit = functions
    .filter(
      (fn) =>
        enclosingClasses(classes, fn.offset).at(-1) === klass &&
        fn.annotations.some(({ name }) => JUNIT_TEST_ANNOTATIONS.has(name)),
    )
    .map((fn) => junitNode(suite, fn));
  const raw = klass.supers.some(({ name }) => isSpecType(name))
    ? specNodes(scanned, specBodies(scanned, klass))
    : [];
  return { ...suite, nodes: [...junit, ...raw.map((node) => kotestNode(suite, node))] };
}

export function discoverSuites(scanned) {
  const classes = classesOf(scanned);
  const context = { scanned, classes, functions: functionsOf(scanned) };
  return classes
    .map((klass) => withNodes(context, suiteOf(classes, klass)))
    .filter(({ nodes }) => nodes.length > 0);
}

export function scanTestFile(text) {
  const scanned = scanKotlinSource(text);
  return generatedFile(scanned) ? undefined : scanned;
}

export function testBodies(scanned, suites) {
  return suites
    .flatMap((suite) => suite.nodes)
    .filter(
      (node) =>
        node.leaf &&
        !node.factory &&
        !(node.framework === 'kotest' && hasNestedRegistration(scanned, node.body)),
    );
}
