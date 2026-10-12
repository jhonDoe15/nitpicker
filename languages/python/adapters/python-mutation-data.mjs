import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MUTANTS_DIRECTORY = 'mutants';
export const MUTATION_REPORT = 'mutation.json';
export const NO_COVERAGE_EXIT_CODE = 33;
export const META_SUFFIX = '.meta';

export function metaFiles(mutantsDirectory) {
  return readdirSync(mutantsDirectory, { recursive: true })
    .filter((file) => file.endsWith(META_SUFFIX))
    .map((file) => file.slice(0, -META_SUFFIX.length).split(path.sep).join('/'));
}

function readExitCodes(file, mutantsDirectory) {
  const meta = JSON.parse(
    readFileSync(path.join(mutantsDirectory, `${file}${META_SUFFIX}`), 'utf8'),
  );
  if (typeof meta?.exit_code_by_key !== 'object' || meta.exit_code_by_key === null) {
    throw new TypeError(
      `mutmut wrote ${file}${META_SUFFIX} without exit_code_by_key: this mutmut version is not supported (tested with mutmut 3.8)`,
    );
  }
  return meta.exit_code_by_key;
}

function withDefault(exitCodes, unchecked) {
  return Object.fromEntries(
    Object.entries(exitCodes).map(([key, code]) => [key, code === null ? unchecked : code]),
  );
}

export function collectRunData({ projectRoot, uncheckedExitCode = null }) {
  const mutantsDirectory = path.join(projectRoot, MUTANTS_DIRECTORY);
  if (!existsSync(mutantsDirectory)) {
    throw new Error('mutmut finished without writing a mutants directory');
  }
  const files = metaFiles(mutantsDirectory).map((file) => ({
    path: file,
    exitCodes: withDefault(readExitCodes(file, mutantsDirectory), uncheckedExitCode),
    mutated: readFileSync(path.join(mutantsDirectory, file), 'utf8'),
    original: existsSync(path.join(projectRoot, file))
      ? readFileSync(path.join(projectRoot, file), 'utf8')
      : undefined,
  }));
  return { files };
}
