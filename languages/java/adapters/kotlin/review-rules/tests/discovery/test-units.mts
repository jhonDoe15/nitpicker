import type {
  BareNode,
  BareSuite,
  ClassInfo,
  FunctionInfo,
  Suite,
  SpecNode,
  TestNode,
  TestScanned,
} from '../typed/discovery-types.mts';
import { scanKotlinSource } from '../../../scan/kotlin-source.mts';
import { generatedFile } from '../../../scan/rules/markers.mts';
import { textTables } from './text-scan.mts';
import { classesOf, enclosingClasses, ownersOf } from './declarations.mts';
import { functionsOf } from './functions.mts';
import {
  hasNestedRegistration,
  isSpecType,
  specBodies,
  specNodes,
} from './kotest/kotest-specs.mts';

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

function maskBackticks(text: string): string {
  return text.replaceAll(BACKTICK_NAME, (name) =>
    NON_WORD.test(name.slice(1, -1)) ? `\`${'_'.repeat(name.length - 2)}\`` : name,
  );
}

export function scanTestFile(text: string, assertionNames: string[] = []): TestScanned | undefined {
  const scanned = scanKotlinSource(maskBackticks(text));
  if (generatedFile(scanned)) {
    return undefined;
  }
  const literals = scanned.literals.map((literal) => ({
    ...literal,
    text: text.slice(literal.bodyStart, literal.bodyStart + literal.text.length),
  }));
  return {
    ...scanned,
    source: text,
    literals,
    tables: textTables(scanned.code),
    assertionNames: new Set(assertionNames),
    memo: new Map(),
  };
}

function junitNode(suite: BareSuite, fn: FunctionInfo): BareNode {
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
    dynamic: false,
    factory: fn.annotations.some(({ name }) => name === 'TestFactory'),
  };
}

function kotestNode(suite: BareSuite, raw: SpecNode): BareNode {
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

function suiteOf(classes: ClassInfo[], klass: ClassInfo): BareSuite {
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

function testFunctions(
  functions: FunctionInfo[],
  owners: Map<number, ClassInfo | undefined>,
): Map<ClassInfo | undefined, FunctionInfo[]> {
  return Map.groupBy(
    functions.filter((fn) => fn.annotations.some(({ name }) => JUNIT_TEST_ANNOTATIONS.has(name))),
    (fn) => owners.get(fn.offset),
  );
}

function withNodes(
  scanned: TestScanned,
  suite: BareSuite,
  byOwner: Map<ClassInfo | undefined, FunctionInfo[]>,
): BareSuite {
  const junit = (byOwner.get(suite.klass) ?? []).map((fn) => junitNode(suite, fn));
  const raw = suite.klass.supers.some(({ name }) => isSpecType(name))
    ? specNodes(scanned, specBodies(scanned, suite.klass))
    : [];
  const kotest = raw.map((node) => kotestNode(suite, node));
  return { ...suite, nodes: [...junit, ...kotest].toSorted((a, b) => a.offset - b.offset) };
}

export function discoverSuites(scanned: TestScanned): Suite[] {
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

export function testBodies(scanned: TestScanned, suites: Suite[]): TestNode[] {
  return suites
    .flatMap((suite) => suite.nodes)
    .filter(
      (node) =>
        node.leaf &&
        !node.factory &&
        !(node.framework === 'kotest' && hasNestedRegistration(scanned, node.body)),
    );
}
