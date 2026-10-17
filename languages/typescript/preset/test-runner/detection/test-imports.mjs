import { readFileSync } from 'node:fs';
import path from 'node:path';

const RUNNER_MODULES = new Map([
  ['vitest', 'vitest'],
  ['jest', '@jest/globals'],
  ['mocha', 'mocha'],
  ['node', 'node:test'],
]);

const IMPORTED_MODULE = /\b(?:from|import|require)\s*(?:\(\s*)?['"](?<specifier>[^'"\n]+)['"]/gu;

function importedRunner(source) {
  const specifiers = new Set(
    [...source.matchAll(IMPORTED_MODULE)].map(({ groups }) => groups.specifier),
  );
  return [...RUNNER_MODULES].find(([, specifier]) => specifiers.has(specifier))?.[0];
}

function readTestFile(projectRoot, file) {
  const target = path.resolve(projectRoot, file);
  if (!target.startsWith(`${projectRoot}${path.sep}`)) {
    return '';
  }
  return readFileSync(target, 'utf8');
}

function importCounts(projectRoot, layout) {
  const counts = new Map();
  for (const file of layout.projectCodeFiles(projectRoot).filter(layout.isRunnableTestFile)) {
    const runner = importedRunner(readTestFile(projectRoot, file));
    if (runner !== undefined) {
      counts.set(runner, (counts.get(runner) ?? 0) + 1);
    }
  }
  return counts;
}

function describeCount(count, specifier) {
  return count === 1
    ? `1 test file imports ${specifier}`
    : `${String(count)} test files import ${specifier}`;
}

export function importEvidence(projectRoot, layout) {
  const counts = [...importCounts(projectRoot, layout)];
  const most = Math.max(0, ...counts.map(([, count]) => count));
  return counts
    .filter(([, count]) => count === most)
    .map(([runner, count]) => ({
      runner,
      evidence: describeCount(count, RUNNER_MODULES.get(runner)),
    }));
}
