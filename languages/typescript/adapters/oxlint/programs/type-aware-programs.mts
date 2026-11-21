import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';
import { fieldsOf, listOf, parseJson } from '../../../../../shared/values/readers.mts';
import type { LintResult } from '../plan/oxlint-shapes.mts';
import { globalDeclarationFiles, listProgramFiles } from './global-declarations.mts';

export const FILES_PER_PROGRAM_VARIABLE = 'NITPICKER_TYPE_AWARE_FILES_PER_PROGRAM';

const FILES_PER_PROGRAM = 500;
const STAGE_CONFIG = 'tsconfig.json';

type ProgramRun = {
  readonly stage: string;
  readonly files: readonly string[];
  readonly environment: Environment;
  readonly timeoutMs: number | undefined;
};

type Lint = (files: readonly string[]) => Promise<LintResult[]>;

export function programSlices(files: readonly string[], perProgram: number): string[][] {
  const sorted = [...files].sort();
  const count = Math.max(1, Math.ceil(sorted.length / perProgram));
  const size = Math.ceil(sorted.length / count);
  return Array.from({ length: count }, (_slice, index) =>
    sorted.slice(index * size, (index + 1) * size),
  ).filter((slice) => slice.length > 0);
}

export function filesPerProgram(environment: Environment): number {
  const configured = Number(environment[FILES_PER_PROGRAM_VARIABLE]);
  return Number.isInteger(configured) && configured > 0 ? configured : FILES_PER_PROGRAM;
}

export async function lintInPrograms(run: ProgramRun, lint: Lint): Promise<LintResult[]> {
  const configPath = path.join(run.stage, STAGE_CONFIG);
  const perProgram = filesPerProgram(run.environment);
  if (run.files.length <= perProgram || !isWrittenConfig(configPath)) {
    return lint(run.files);
  }
  const listing = await listProgramFiles(run);
  const listed = new Set(listing?.files ?? []);
  const inProgram = run.files.filter((file) => listed.has(path.join(run.stage, file)));
  if (listing === undefined || inProgram.length <= perProgram) {
    return lint(run.files);
  }
  const outside = run.files.filter((file) => !listed.has(path.join(run.stage, file)));
  const shared = globalDeclarationFiles(listing);
  const original = readFileSync(configPath, 'utf8');
  const results: LintResult[] = outside.length === 0 ? [] : await lint(outside);
  try {
    for (const slice of programSlices(inProgram, perProgram)) {
      const roots = [...shared, ...slice.map((file) => path.join(run.stage, file))];
      writeFileSync(configPath, slicedConfig(original, roots));
      appendAll(results, await lint(slice));
    }
  } finally {
    writeFileSync(configPath, original);
  }
  return results;
}

function isWrittenConfig(configPath: string): boolean {
  return lstatSync(configPath, { throwIfNoEntry: false })?.isFile() === true;
}

function slicedConfig(original: string, roots: readonly string[]): string {
  const config = fieldsOf(parseJson(original));
  const kept = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'include'));
  return JSON.stringify({
    ...kept,
    files: [...new Set([...listOf(config['files']), ...roots])],
    compilerOptions: { ...fieldsOf(config['compilerOptions']), checkers: 1 },
  });
}
