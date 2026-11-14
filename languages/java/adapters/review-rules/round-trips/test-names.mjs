import { reachableNames } from '../../../../../shared/rules/round-trips/round-trips.mjs';
import { bodyOf, LANGUAGE_RULES, parseStructure } from '../../reuse/source/jvm-declarations.mjs';
import {
  discoverSuites,
  scanTestFile,
  testBodies,
} from '../../kotlin/review-rules/tests/discovery/test-units.mjs';
import { functionsOf } from '../../kotlin/review-rules/tests/discovery/functions.mjs';

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

function helperTable(entries) {
  const table = new Map();
  for (const [name, names] of entries) {
    table.set(name, new Set([...(table.get(name) ?? []), ...names]));
  }
  return table;
}

function expanded(tests, helpers) {
  const table = helperTable(helpers);
  return tests.map((names) => reachableNames(names, table));
}

function annotationName(head, at) {
  const chain = [at + 1];
  for (const index of chain) {
    if (head[index + 1]?.text === '.' && head[index + 2]?.kind === 'identifier') {
      chain.push(index + 2);
    }
  }
  return head[chain.at(-1)]?.text;
}

function isTestMethod(head, name) {
  return (
    JUNIT3_TEST.test(name) ||
    head.some(({ text }, at) => text === '@' && TEST_ANNOTATIONS.has(annotationName(head, at)))
  );
}

function methodOf(structure, member, info) {
  const head = structure.tokens.slice(member.start, info.paren ?? member.start);
  const body = bodyOf(structure.tokens, structure.close, member);
  const names = new Set(
    structure.tokens
      .slice(body.from, body.to)
      .filter(({ kind }) => kind === 'identifier')
      .map(({ text }) => text),
  );
  return { name: info.name, isTest: isTestMethod(head, info.name), names };
}

function entryOf(structure, member) {
  const info = LANGUAGE_RULES.java.member(structure.tokens, structure.close, member);
  const body = bodyOf(structure.tokens, structure.close, member);
  if (info.name === undefined || body === undefined) {
    return {};
  }
  return info.type ? { range: body } : { method: methodOf(structure, member, info) };
}

function javaMethods(structure, range) {
  const ranges = [range];
  const methods = [];
  for (const current of ranges) {
    const entries = LANGUAGE_RULES.java
      .members(structure.tokens, structure.close, current)
      .map((member) => entryOf(structure, member));
    ranges.push(...entries.flatMap((entry) => (entry.range === undefined ? [] : [entry.range])));
    methods.push(...entries.flatMap((entry) => (entry.method === undefined ? [] : [entry.method])));
  }
  return methods;
}

export function javaTestNames(source) {
  const structure = parseStructure(source, { kotlin: false });
  const methods = javaMethods(structure, {
    from: structure.header.end,
    to: structure.tokens.length,
  });
  const helpers = methods.filter(({ isTest }) => !isTest).map(({ name, names }) => [name, names]);
  return expanded(
    methods.filter(({ isTest }) => isTest).map(({ names }) => names),
    helpers,
  );
}

function identifiers(code, { start, end }) {
  return new Set(code.slice(start, end).match(IDENTIFIER) ?? []);
}

export function kotlinTestNames(text) {
  const scanned = scanTestFile(text);
  if (scanned === undefined) {
    return [];
  }
  const tests = testBodies(scanned, discoverSuites(scanned));
  const testOffsets = new Set(tests.map(({ offset }) => offset));
  const helpers = functionsOf(scanned)
    .filter(({ offset }) => !testOffsets.has(offset))
    .map((fn) => [fn.name, identifiers(scanned.code, fn.body)]);
  return expanded(
    tests.map(({ body }) => identifiers(scanned.code, body)),
    helpers,
  );
}
