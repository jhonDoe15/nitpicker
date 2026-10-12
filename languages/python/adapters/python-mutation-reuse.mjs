import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { META_SUFFIX, MUTANTS_DIRECTORY, metaFiles } from './python-mutation-data.mjs';

const TEST_FILE = /(?:^|\/)(?:test_[^/]*|[^/]*_test|conftest)\.py$/u;
const TEST_DIRECTORY = /(?:^|\/)tests?\//u;
const REUSABLE_STATUSES = ['M', 'A'];

function gitOutput(cwd, arguments_) {
  const result = spawnSync('git', arguments_, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : undefined;
}

function parseNameStatus(listing) {
  const fields = listing.split('\0').filter((field) => field !== '');
  return fields.flatMap((field, index) =>
    index % 2 === 0 ? [{ status: field, file: fields[index + 1] }] : [],
  );
}

function changesSinceBase({ baselineRoot, projectRoot }) {
  const baseCommit = gitOutput(baselineRoot, ['rev-parse', 'HEAD'])?.trim();
  const prefix = gitOutput(projectRoot, ['rev-parse', '--show-prefix'])?.trim();
  const listing =
    baseCommit === undefined
      ? undefined
      : gitOutput(projectRoot, [
          'diff',
          '--name-status',
          '--no-renames',
          '-z',
          baseCommit,
          'HEAD',
          '--',
          ':/',
        ]);
  return listing === undefined || prefix === undefined
    ? undefined
    : parseNameStatus(listing).map((change) => ({ ...change, prefix }));
}

function isMutatedSourceChange({ status, file, prefix }, sourceRoots) {
  if (!REUSABLE_STATUSES.includes(status) || !file.startsWith(prefix)) {
    return false;
  }
  const relative = file.slice(prefix.length);
  return (
    relative.endsWith('.py') &&
    !TEST_FILE.test(relative) &&
    !TEST_DIRECTORY.test(relative) &&
    sourceRoots.some((root) => root === '.' || relative.startsWith(`${root}/`))
  );
}

export function seedMutantsFromBase({ snapshot, baselineRoot, projectRoot, sourceRoots }) {
  if (snapshot !== 'head' || baselineRoot === undefined) {
    return false;
  }
  const baseMutants = path.join(baselineRoot, MUTANTS_DIRECTORY);
  const changes = existsSync(baseMutants)
    ? changesSinceBase({ baselineRoot, projectRoot })
    : undefined;
  if (
    changes === undefined ||
    !changes.every((change) => isMutatedSourceChange(change, sourceRoots))
  ) {
    return false;
  }
  for (const file of metaFiles(baseMutants)) {
    const target = path.join(projectRoot, MUTANTS_DIRECTORY, `${file}${META_SUFFIX}`);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(baseMutants, `${file}${META_SUFFIX}`), target);
  }
  return true;
}
