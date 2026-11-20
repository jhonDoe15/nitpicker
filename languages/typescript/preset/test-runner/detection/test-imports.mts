import { largest } from '../typed/shared-views.mts';
import type { DetectionLayout, RunnerEvidence } from '../typed/command-types.mts';
import { TEST_RUNNERS } from '../runners.mts';
import { projectText } from '../../test-environment/dom-code/dom-tests.mts';
import {
  defaultTestFiles,
  mergedTestFiles,
  testFileMatcher,
} from '../test-files/test-file-patterns.mts';

const RUNNER_MODULES = new Map([
  ['vitest', 'vitest'],
  ['jest', '@jest/globals'],
  ['mocha', 'mocha'],
  ['node', 'node:test'],
]);

const IMPORTED_MODULE = /\b(?:from|import|require)\s*(?:\(\s*)?['"](?<specifier>[^'"\n]+)['"]/gu;

function importedRunner(source: string): string | undefined {
  const specifiers = new Set(
    [...source.matchAll(IMPORTED_MODULE)].map(({ groups }) => groups?.['specifier']),
  );
  return [...RUNNER_MODULES].find(([, specifier]) => specifiers.has(specifier))?.[0];
}

const isAnyRunnerDefault = testFileMatcher(mergedTestFiles(TEST_RUNNERS.map(defaultTestFiles)));

function structuralTestFiles(projectRoot: string, layout: DetectionLayout): readonly string[] {
  return layout
    .projectCodeFiles(projectRoot)
    .filter((file) => layout.isTestFile(file) || isAnyRunnerDefault(file));
}

function importCounts(projectRoot: string, layout: DetectionLayout): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of structuralTestFiles(projectRoot, layout)) {
    const runner = importedRunner(projectText(projectRoot, file));
    if (runner !== undefined) {
      counts.set(runner, (counts.get(runner) ?? 0) + 1);
    }
  }
  return counts;
}

function describeCount(count: number, specifier: string): string {
  return count === 1
    ? `1 test file imports ${specifier}`
    : `${String(count)} test files import ${specifier}`;
}

export function importEvidence(projectRoot: string, layout: DetectionLayout): RunnerEvidence[] {
  const counts = [...importCounts(projectRoot, layout)];
  const most = largest([0, ...counts.map(([, count]) => count)]);
  return counts
    .filter(([, count]) => count === most)
    .map(([runner, count]) => ({
      runner,
      evidence: describeCount(count, RUNNER_MODULES.get(runner) ?? runner),
    }));
}
