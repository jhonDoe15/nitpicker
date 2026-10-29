import { runGit } from '../repository/command.mjs';
import { RENAME_DETECTION, RENAME_LIMIT_SETTING } from './changes.mjs';

const NUL = String.fromCodePoint(0);
const NUMSTAT_ENTRY = new RegExp(
  `(\\d+|-)\\t(\\d+|-)\\t(?:${NUL}[^${NUL}]*${NUL})?([^${NUL}]+)${NUL}`,
  'gu',
);

const TEST_FILE = new RegExp(
  [
    String.raw`(?:^|/)(?:tests?|__tests__|specs?)/`,
    String.raw`\.(?:test|spec)\.[cm]?[jt]sx?$`,
    String.raw`(?:^|/)test_[^/]*\.py$`,
    String.raw`_test\.py$`,
    String.raw`(?:^|/)conftest\.py$`,
    String.raw`(?:Tests?|IT|Spec)\.(?:java|kt|kts|groovy|scala)$`,
  ].join('|'),
  'u',
);

export function isTestFile(file) {
  return TEST_FILE.test(file);
}

export function parseNumstat(output) {
  return [...output.matchAll(NUMSTAT_ENTRY)].map(([, added, removed, file]) => ({
    added: Number(added),
    removed: Number(removed),
    file,
  }));
}

export function removesTests(entries) {
  return entries.some(
    ({ added, removed, file }) => isTestFile(file) && Number.isFinite(removed) && removed > added,
  );
}

export function readRemovesTests({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  baseProjectRelativePath = projectRelativePath,
}) {
  const output = runGit(repositoryRoot, [
    '-c',
    'core.quotePath=false',
    '-c',
    RENAME_LIMIT_SETTING,
    'diff',
    '--numstat',
    '-z',
    RENAME_DETECTION,
    '--no-color',
    '--no-ext-diff',
    `${mergeBaseSha}...${headSha}`,
    '--',
    ...new Set([projectRelativePath, baseProjectRelativePath]),
  ]);
  return removesTests(parseNumstat(output));
}
