import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { runEngineSync } from '../../../../../shared/engine/engine-run.mts';

export type ListedFile = { readonly path: string; readonly display: string };

export type Environment = Readonly<Record<string, string | undefined>>;

const TIME_LIMIT_MS = 30 * 60 * 1000;
const SWITCH = 'NITPICKER_STRUCTURE_ENGINE';
const LIST_BREAKS = /[\t\n\r]/u;

export function isListable({ path: file, display }: ListedFile): boolean {
  return !LIST_BREAKS.test(file) && !LIST_BREAKS.test(display);
}

function required(environment: Environment, reason: string): undefined {
  if (environment[SWITCH] === 'required') {
    throw new Error(`${SWITCH}=required, but ${reason}`);
  }
  return undefined;
}

function readOutput<Result>(
  out: string,
  read: (out: string) => Result,
  environment: Environment,
): Result | undefined {
  try {
    return read(out);
  } catch (error) {
    return required(environment, `its output could not be read: ${String(error)}`);
  }
}

export function engineOutput<Result>(
  command: string,
  files: readonly ListedFile[],
  environment: Environment,
  read: (out: string) => Result,
): Result | undefined {
  if (environment[SWITCH] === 'off' || files.length === 0) {
    return undefined;
  }
  const binary = findEngine(environment);
  if (binary === undefined) {
    return required(environment, 'there is no engine binary');
  }
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-structure-'));
  try {
    const list = path.join(folder, 'files.tsv');
    const out = path.join(folder, 'out');
    writeFileSync(list, files.map((file) => `${file.path}\t${file.display}\n`).join(''));
    const { status, stderr } = runEngineSync([command, '--files', list, '--out', out], {
      binary,
      timeoutMs: TIME_LIMIT_MS,
    });
    return status === 0
      ? readOutput(out, read, environment)
      : required(environment, `${command} ended with status ${String(status)}: ${stderr.trim()}`);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
