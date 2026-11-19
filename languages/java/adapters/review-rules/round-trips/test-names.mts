import { reachableNames as untypedReachableNames } from '../../../../../shared/rules/round-trips/round-trips.mjs';
import { bodyOf, LANGUAGE_RULES, parseStructure } from '../../reuse/source/jvm-declarations.mts';
import type { Member, MemberInfo, Range, Structure } from '../../reuse/source/jvm-source-types.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';
import type { Span } from '../../kotlin/review-rules/tests/typed/discovery-types.mts';
import {
  discoverSuites,
  scanTestFile,
  testBodies,
} from '../../kotlin/review-rules/tests/discovery/test-units.mts';
import { functionsOf } from '../../kotlin/review-rules/tests/discovery/functions.mts';
import { appendAll } from '../../../../../shared/lists/items.mjs';

type TestMethod = { readonly name: string; readonly isTest: boolean; readonly names: Set<string> };
type MethodEntry = { readonly range?: Range; readonly method?: TestMethod };

const reachableNames: (names: Set<string>, helpers: Map<string, Set<string>>) => Set<string> =
  untypedReachableNames;

const TEST_ANNOTATIONS = new Set([
  'Test',
  'ParameterizedTest',
  'RepeatedTest',
  'TestFactory',
  'TestTemplate',
  'Property',
]);
const IDENTIFIER = /[A-Za-z_$][\w$]*/gu;
const JUNIT3_TEST = /^test[A-Z0-9_]/u;

function helperTable(
  entries: readonly (readonly [string, Set<string>])[],
): Map<string, Set<string>> {
  const table = new Map<string, Set<string>>();
  for (const [name, names] of entries) {
    table.set(name, new Set([...(table.get(name) ?? []), ...names]));
  }
  return table;
}

function expanded(
  tests: readonly Set<string>[],
  helpers: readonly (readonly [string, Set<string>])[],
): Set<string>[] {
  const table = helperTable(helpers);
  return tests.map((names) => reachableNames(names, table));
}

function annotationName(head: readonly Token[], at: number): string | undefined {
  const chain = [at + 1];
  for (const index of chain) {
    if (head[index + 1]?.text === '.' && head[index + 2]?.kind === 'identifier') {
      chain.push(index + 2);
    }
  }
  return head[chain.at(-1) ?? 0]?.text;
}

function isTestMethod(head: readonly Token[], name: string): boolean {
  return (
    JUNIT3_TEST.test(name) ||
    head.some(
      ({ text }, at) => text === '@' && TEST_ANNOTATIONS.has(annotationName(head, at) ?? ''),
    )
  );
}

type MethodParts = {
  readonly member: Member;
  readonly info: MemberInfo & { readonly name: string };
  readonly body: Range;
};

function methodOf(structure: Structure, { member, info, body }: MethodParts): TestMethod {
  const head = structure.tokens.slice(member.start, info.paren ?? member.start);
  const names = new Set(
    structure.tokens
      .slice(body.from, body.to)
      .filter(({ kind }) => kind === 'identifier')
      .map(({ text }) => text),
  );
  return { name: info.name, isTest: isTestMethod(head, info.name), names };
}

function entryOf(structure: Structure, member: Member): MethodEntry {
  const info = LANGUAGE_RULES.java.member(structure.tokens, structure.close, member);
  const body = bodyOf(structure.tokens, structure.close, member);
  if (info?.name === undefined || body === undefined) {
    return {};
  }
  return info.type
    ? { range: body }
    : { method: methodOf(structure, { member, info: { ...info, name: info.name }, body }) };
}

function javaMethods(structure: Structure, range: Range): TestMethod[] {
  const ranges = [range];
  const methods: TestMethod[] = [];
  for (const current of ranges) {
    const entries = LANGUAGE_RULES.java
      .members(structure.tokens, structure.close, current)
      .map((member) => entryOf(structure, member));
    appendAll(
      ranges,
      entries.flatMap((entry) => (entry.range === undefined ? [] : [entry.range])),
    );
    appendAll(
      methods,
      entries.flatMap((entry) => (entry.method === undefined ? [] : [entry.method])),
    );
  }
  return methods;
}

export function javaTestNames(source: string): Set<string>[] {
  const structure = parseStructure(source, { kotlin: false });
  const methods = javaMethods(structure, {
    from: structure.header.end,
    to: structure.tokens.length,
  });
  const helpers = methods
    .filter(({ isTest }) => !isTest)
    .map(({ name, names }): [string, Set<string>] => [name, names]);
  return expanded(
    methods.filter(({ isTest }) => isTest).map(({ names }) => names),
    helpers,
  );
}

function identifiers(code: string, { start, end }: Span): Set<string> {
  return new Set(code.slice(start, end).match(IDENTIFIER) ?? []);
}

export function kotlinTestNames(text: string): Set<string>[] {
  const scanned = scanTestFile(text);
  if (scanned === undefined) {
    return [];
  }
  const tests = testBodies(scanned, discoverSuites(scanned));
  const testOffsets = new Set(tests.map(({ offset }) => offset));
  const helpers = functionsOf(scanned)
    .filter(({ offset }) => !testOffsets.has(offset))
    .map((fn): [string, Set<string>] => [fn.name, identifiers(scanned.code, fn.body)]);
  return expanded(
    tests.map(({ body }) => identifiers(scanned.code, body)),
    helpers,
  );
}
