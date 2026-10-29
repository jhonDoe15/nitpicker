import { scanKotlinSource } from '../../../scan/kotlin-source.mjs';
import { generatedFile } from '../../../scan/rules/markers.mjs';
import { textTables } from './text-scan.mjs';
import { classesOf, enclosingClasses, ownersOf } from './declarations.mjs';
import { functionsOf } from './functions.mjs';
import {
  hasNestedRegistration,
  isSpecType,
  specBodies,
  specNodes,
} from './kotest/kotest-specs.mjs';

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
const BACKTICK_NAME = /`[^`\n]+`/gu;
const NON_WORD = /\W/u;

function maskBackticks(text) {
  return text.replaceAll(BACKTICK_NAME, (name) =>
    NON_WORD.test(name.slice(1, -1)) ? `\`${'_'.repeat(name.length - 2)}\`` : name,
  );
}

export function scanTestFile(text) {
  const scanned = scanKotlinSource(maskBackticks(text));
  if (generatedFile(scanned)) {
    return undefined;
  }
  const literals = scanned.literals.map((literal) => ({
    ...literal,
    text: text.slice(literal.bodyStart, literal.bodyStart + literal.text.length),
  }));
  return { ...scanned, source: text, literals, tables: textTables(scanned.code), memo: new Map() };
}

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
    dynamic: raw.dynamic,
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

function testFunctions(functions, owners) {
  return Map.groupBy(
    functions.filter((fn) => fn.annotations.some(({ name }) => JUNIT_TEST_ANNOTATIONS.has(name))),
    (fn) => owners.get(fn.offset),
  );
}

function withNodes(scanned, suite, byOwner) {
  const junit = (byOwner.get(suite.klass) ?? []).map((fn) => junitNode(suite, fn));
  const raw = suite.klass.supers.some(({ name }) => isSpecType(name))
    ? specNodes(scanned, specBodies(scanned, suite.klass))
    : [];
  const kotest = raw.map((node) => kotestNode(suite, node));
  return { ...suite, nodes: [...junit, ...kotest].toSorted((a, b) => a.offset - b.offset) };
}

export function discoverSuites(scanned) {
  const classes = classesOf(scanned);
  const functions = functionsOf(scanned);
  const owners = ownersOf(
    classes,
    functions.map(({ offset }) => offset),
  );
  const byOwner = testFunctions(functions, owners);
  return classes
    .map((klass) => {
      const suite = withNodes(scanned, suiteOf(classes, klass), byOwner);
      return { ...suite, nodes: suite.nodes.map((node) => ({ ...node, suite })) };
    })
    .filter(({ nodes }) => nodes.length > 0);
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
