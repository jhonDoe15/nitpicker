import { readFileSync } from 'node:fs';
import type { Finding } from '../../../values/findings.mts';
import { sharedFactFindings } from '../evaluate.mts';
import { FACT_RULE_LANGUAGES } from '../../../project-rules/fact-rules.mts';
import type { FactImport, Facts } from '../typed/fact-types.mts';

function isFacts(value: unknown): value is Facts {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function factFixture(name: string): Facts {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'),
  );
  if (!isFacts(parsed)) {
    throw new TypeError(`fixture ${name} is not a JSON object`);
  }
  return parsed;
}

export function findingsOf(
  facts: unknown,
  rules: readonly string[] | undefined,
  options: object = {},
): Finding[] {
  return sharedFactFindings(facts, {
    language: 'typescript',
    analyzerName: 'facts',
    rules,
    ...options,
  });
}

export function fixtureFindings(
  name: string,
  rules: readonly string[] | undefined,
  options: object = {},
): Finding[] {
  return findingsOf(factFixture(name), rules, options);
}

export function rows(findings: readonly Finding[]): string[][] {
  return findings.map(({ rule, path, identity }) => [rule, path, identity]);
}

export function exception(
  rule: string,
  path: string,
): { readonly rule: string; readonly paths: string[]; readonly reason: string } {
  return { rule, paths: [path], reason: 'test' };
}

export function withLanguageRegistered<Result>(
  rule: string,
  language: string,
  run: () => Result,
): Result {
  const columns = FACT_RULE_LANGUAGES[rule];
  if (columns === undefined) {
    throw new Error(`"${rule}" is not a fact rule`);
  }
  const before: unknown = Reflect.get(columns, language);
  Reflect.set(columns, language, true);
  try {
    return run();
  } finally {
    Reflect.set(columns, language, before);
  }
}

export function firstOf<Item>(items: readonly Item[]): Item {
  const [first] = items;
  if (first === undefined) {
    throw new Error('expected at least one item');
  }
  return first;
}

export function importModules(
  imports: readonly FactImport[],
  {
    tests = [],
    extras = () => ({}),
  }: { tests?: readonly string[]; extras?: (file: string) => object } = {},
): { modules: { file: string; role: string }[]; imports: readonly FactImport[] } {
  const files = [...new Set(imports.flatMap(({ from, to }) => [from, to]))];
  return {
    modules: files.map((file) => ({
      file,
      role: tests.includes(file) ? 'test' : 'production',
      ...extras(file),
    })),
    imports,
  };
}
