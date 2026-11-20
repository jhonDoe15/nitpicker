import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { parseJson, textsOf } from '../../../../../shared/values/readers.mts';

export const LISTED_FILES_VARIABLE = 'NITPICKER_OXLINT_LISTED_FILES';

export function listedFiles(environment: Environment): string[] | undefined {
  const listPath = environment[LISTED_FILES_VARIABLE];
  return listPath === undefined || listPath.length === 0
    ? undefined
    : textsOf(parseJson(readFileSync(listPath, 'utf8')));
}

export async function withListedFiles<Result>(
  files: readonly string[],
  run: (environment: Readonly<Record<string, string>>) => Promise<Result>,
): Promise<Result> {
  const directory = await mkdtemp(path.join(tmpdir(), 'nitpicker-oxlint-files-'));
  const listPath = path.join(directory, 'files.json');
  try {
    await writeFile(listPath, JSON.stringify(files));
    return await run({ [LISTED_FILES_VARIABLE]: listPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
