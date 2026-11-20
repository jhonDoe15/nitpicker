import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import { runEngineSync } from '../../../../shared/engine/engine-run.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { nativeCompilerPath } from './compiler-binary.mts';

export type TypedChecksRequest = {
  readonly project: string | ((folder: string) => string);
  readonly checks: readonly string[];
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly environment?: NodeJS.ProcessEnv;
};

export type TypedChecksOutcome =
  | {
      readonly checks: Readonly<Record<string, unknown>>;
      readonly report: unknown;
      readonly unavailable?: undefined;
    }
  | { readonly unavailable: string; readonly checks?: undefined; readonly report?: undefined };

const TYPES_UNAVAILABLE = 3;
const SWITCH = 'NITPICKER_TYPED_ENGINE';

function inputArguments(folder: string, inputs: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(inputs).flatMap(([check, input]) => {
    const file = path.join(folder, `${check}.input.json`);
    writeFileSync(file, JSON.stringify(input));
    return ['--input', `${check}=${file}`];
  });
}

function engineOutcome(
  { engine, compiler }: { readonly engine: string; readonly compiler: string },
  { project, checks, inputs = {} }: TypedChecksRequest,
  folder: string,
): TypedChecksOutcome {
  const out = path.join(folder, 'report.json');
  const configPath = typeof project === 'string' ? project : project(folder);
  const { status, stderr } = runEngineSync(
    [
      'typescript-typed',
      '--compiler',
      compiler,
      '--project',
      configPath,
      '--checks',
      checks.join(','),
      ...inputArguments(folder, inputs),
      '--out',
      out,
    ],
    { binary: engine },
  );
  if (status === TYPES_UNAVAILABLE) {
    return { unavailable: stderr.trim().split('\n').at(-1) ?? 'types unavailable' };
  }
  if (status !== 0) {
    return { unavailable: `the engine ended with status ${String(status)}: ${stderr.trim()}` };
  }
  const report: unknown = JSON.parse(readFileSync(out, 'utf8'));
  const results = fieldOf(report, 'checks');
  return typeof results === 'object' && results !== null
    ? { checks: { ...results }, report }
    : { unavailable: 'the engine wrote no results' };
}

export function runTypedChecks(request: TypedChecksRequest): TypedChecksOutcome {
  const environment = request.environment ?? process.env;
  if (environment[SWITCH] === 'off') {
    return { unavailable: `${SWITCH}=off` };
  }
  const engine = findEngine(environment);
  const compiler = engine === undefined ? undefined : nativeCompilerPath();
  if (engine === undefined || compiler === undefined) {
    const unavailable = engine === undefined ? 'no engine binary' : 'no TypeScript 7 compiler';
    if (environment[SWITCH] === 'required') {
      throw new Error(`${SWITCH}=required, but there is ${unavailable}`);
    }
    return { unavailable };
  }
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-typed-'));
  try {
    return engineOutcome({ engine, compiler }, request, folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
