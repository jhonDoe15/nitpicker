import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SUPPORTED_MUTMUT } from '../../ingest/mutmut.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { insideProject } from '../../libraries/project-files.mts';
import { JSON_NULL } from '../analysis/typed/json-null.mts';
import type { JsonNull } from '../analysis/typed/python-graph-types.mts';

type ExitCode = number | JsonNull;
type ExitCodes = Readonly<Record<string, ExitCode>>;
type MutantFile = {
  readonly path: string;
  readonly exitCodes: ExitCodes;
  readonly mutated: string;
  readonly original: string | undefined;
};

export const MUTANTS_DIRECTORY = 'mutants';
export const NO_COVERAGE_EXIT_CODE = 33;
export const META_SUFFIX = '.meta';

export function metaFiles(mutantsDirectory: string): string[] {
  return readdirSync(mutantsDirectory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith(META_SUFFIX))
    .map((file) => file.slice(0, -META_SUFFIX.length).split(path.sep).join('/'));
}

function exitCodeOf(code: unknown): ExitCode {
  return typeof code === 'number' ? code : JSON_NULL;
}

function readExitCodes(file: string, mutantsDirectory: string): ExitCodes {
  const meta: unknown = JSON.parse(
    readFileSync(insideProject(mutantsDirectory, `${file}${META_SUFFIX}`), 'utf8'),
  );
  const exitCodes = fieldOf(meta, 'exit_code_by_key');
  if (typeof exitCodes !== 'object' || exitCodes === null) {
    throw new TypeError(
      `mutmut wrote ${file}${META_SUFFIX} without exit_code_by_key: this mutmut version is not supported (nitpicker reads the run data of ${SUPPORTED_MUTMUT})`,
    );
  }
  return Object.fromEntries(
    Object.entries(exitCodes).map(([key, code]) => [key, exitCodeOf(code)]),
  );
}

function withDefault(exitCodes: ExitCodes, unchecked: number | undefined): ExitCodes {
  return Object.fromEntries(
    Object.entries(exitCodes).map(([key, code]) => [
      key,
      code === null && unchecked !== undefined ? unchecked : code,
    ]),
  );
}

export function collectRunData({
  projectRoot,
  uncheckedExitCode,
}: {
  readonly projectRoot: string;
  readonly uncheckedExitCode?: number | undefined;
}): { files: MutantFile[] } {
  const mutantsDirectory = path.join(projectRoot, MUTANTS_DIRECTORY);
  if (!existsSync(mutantsDirectory)) {
    throw new Error('mutmut finished without writing a mutants directory');
  }
  const files = metaFiles(mutantsDirectory).map((file) => ({
    path: file,
    exitCodes: withDefault(readExitCodes(file, mutantsDirectory), uncheckedExitCode),
    mutated: readFileSync(insideProject(mutantsDirectory, file), 'utf8'),
    original: existsSync(insideProject(projectRoot, file))
      ? readFileSync(insideProject(projectRoot, file), 'utf8')
      : undefined,
  }));
  return { files };
}
