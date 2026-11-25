import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { runEngineSync } from '../../../../../shared/engine/engine-run.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';

export type ListedFile = { readonly path: string; readonly display: string };

export type { Environment } from '../../../../../shared/processes/environment.mts';
type Run = { readonly files: readonly ListedFile[]; readonly environment: Environment };

const TIME_LIMIT_MS = 30 * 60 * 1000;
const SWITCH = 'NITPICKER_STRUCTURE_ENGINE';
const LIST_BREAKS = /[\t\n\r]/u;

export function isListable({ path: file, display }: ListedFile): boolean {
  return !(LIST_BREAKS.test(file) || LIST_BREAKS.test(display));
}

function checkNotRequired(environment: Environment, reason: string): void {
  if (environment[SWITCH] === 'required') {
    throw new Error(`${SWITCH}=required, but ${reason}`);
  }
}

function readOutput<Result>(
  out: string,
  read: (out: string) => Result,
  environment: Environment,
): Result | undefined {
  try {
    return read(out);
  } catch (error) {
    checkNotRequired(environment, `its output could not be read: ${String(error)}`);
    return undefined;
  }
}

export function engineOutput<Result>(
  command: string,
  { files, environment }: Run,
  read: (out: string) => Result,
): Result | undefined {
  if (environment[SWITCH] === 'off' || files.length === 0) {
    return undefined;
  }
  const binary = findEngine(environment);
  if (binary === undefined) {
    checkNotRequired(environment, 'there is no engine binary');
    return undefined;
  }
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-structure-'));
  try {
    return outputIn(folder, { command, files, environment, binary }, read);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function outputIn<Result>(
  folder: string,
  {
    command,
    files,
    environment,
    binary,
  }: Run & { readonly command: string; readonly binary: string },
  read: (out: string) => Result,
): Result | undefined {
  const list = path.join(folder, 'files.tsv');
  const out = path.join(folder, 'out');
  writeFileSync(list, files.map((file) => `${file.path}\t${file.display}\n`).join(''));
  const { status, stderr } = runEngineSync([command, '--files', list, '--out', out], {
    binary,
    timeoutMs: TIME_LIMIT_MS,
  });
  if (status !== 0) {
    checkNotRequired(
      environment,
      `${command} ended with status ${String(status)}: ${stderr.trim()}`,
    );
    return undefined;
  }
  return readOutput(out, read, environment);
}
