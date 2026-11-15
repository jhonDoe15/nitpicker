import { readFileSync } from 'node:fs';
import { listOf, fieldOf, fieldsOf, parseJson } from '../../../../../../shared/values/readers.mts';
import { findingFactory as untypedFindingFactory } from '../review-finding.mjs';
import { springFindings as untypedSpringFindings } from './spring-findings.mjs';
import { springViews as untypedSpringViews } from './view/spring-view.mjs';
import { testMethod as baseTestMethod, type RuleFinding } from '../test-support/facts.mts';

import type { Loose } from '../test-support/loose-facts.mts';

export {
  file,
  fn,
  importOf,
  klass,
  parameter,
  property,
  testFile,
} from '../test-support/loose-facts.mts';
export type { Loose };

export type SpringView = {
  file: { file: string; invocations: { line: number; scope: number }[] };
  typeOf: (scope: number, text: string) => unknown;
};

type ViewInput = {
  files: Loose[];
  projectFiles: Loose[];
  projectRoot: string;
  javaRoots: string[];
};

export const findingFactory: () => unknown = untypedFindingFactory;

function isFinding(value: unknown): value is RuleFinding {
  return typeof value === 'object' && value !== null && 'rule' in value && 'symbol' in value;
}

function isView(value: unknown): value is SpringView {
  return (
    typeof value === 'object' &&
    value !== null &&
    'file' in value &&
    'typeOf' in value &&
    typeof value.typeOf === 'function'
  );
}

export function fixtureFacts(factsPath: string): Loose[] {
  return listOf(fieldOf(parseJson(readFileSync(factsPath, 'utf8')), 'files')).map(fieldsOf);
}

export function springFindings(files: Loose[], options: Loose): RuleFinding[] {
  const found: unknown = Reflect.apply(untypedSpringFindings, undefined, [files, options]);
  return listOf(found).filter(isFinding);
}

export function springViews(input: ViewInput): SpringView[] {
  const found: unknown = Reflect.apply(untypedSpringViews, undefined, [input]);
  return listOf(found).filter(isView);
}

export function run(
  rule: (files: never, options: never) => unknown,
  files: Loose[],
  options: Loose = {},
): RuleFinding[] {
  const found: unknown = Reflect.apply(rule, undefined, [
    files,
    { finding: findingFactory(), projectRoot: '/nonexistent', ...options },
  ]);
  return listOf(found).filter(isFinding);
}

export function testMethod(name = 'waits'): Loose {
  return { ...baseTestMethod(name) };
}
