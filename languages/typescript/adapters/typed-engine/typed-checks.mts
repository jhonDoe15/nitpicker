import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import { runEngineSync } from '../../../../shared/engine/engine-run.mts';
import { pathInside, readTextIfExists } from '../../../../shared/filesystem.mts';
import type { Environment } from '../../../../shared/processes/environment.mts';
import { fieldOf, parseJson } from '../../../../shared/values/readers.mts';
import { nativeCompilerPath } from './compiler-binary.mts';

export type TypedChecksRequest = {
  readonly project: string | ((folder: string) => string);
  readonly checks: readonly string[];
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly environment: Environment;
};

export type TypedChecksOutcome =
  | {
      readonly checks: Readonly<Record<string, unknown>>;
      readonly report: unknown;
      readonly unavailable?: undefined;
      readonly failed?: undefined;
    }
  | {
      readonly unavailable: string;
      readonly failed?: true;
      readonly checks?: undefined;
      readonly report?: undefined;
    };

const TYPES_UNAVAILABLE = 3;
const SWITCH = 'NITPICKER_TYPED_ENGINE';
const TIME_LIMIT_MS = 20 * 60 * 1000;

type Tools = { readonly engine: string; readonly compiler: string };

function writtenReport(out: string): unknown {
  const text = readTextIfExists(out);
  try {
    return text === '' ? undefined : parseJson(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function inputArguments(folder: string, inputs: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(inputs).flatMap(([check, input]) => {
    const file = pathInside(folder, `${check}.input.json`);
    if (file === undefined) {
      throw new Error(`The check name ${check} is not a file name`);
    }
    writeFileSync(file, JSON.stringify(input));
    return ['--input', `${check}=${file}`];
  });
}

function engineOutcome(
  { engine, compiler }: Tools,
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
    { binary: engine, timeoutMs: TIME_LIMIT_MS },
  );
  if (status === TYPES_UNAVAILABLE) {
    return { unavailable: stderr.trim().split('\n').at(-1) ?? 'types unavailable' };
  }
  const report = status === 0 ? writtenReport(out) : undefined;
  const results = fieldOf(report, 'checks');
  if (typeof results === 'object' && results !== null) {
    return { checks: { ...results }, report };
  }
  return {
    failed: true,
    unavailable:
      status === 0
        ? 'the engine wrote no results'
        : `the engine ended with status ${String(status)}: ${stderr.trim()}`,
  };
}

function toolsIn(environment: Environment): Tools | { readonly unavailable: string } {
  const engine = findEngine(environment);
  const compiler = engine === undefined ? undefined : nativeCompilerPath();
  if (engine !== undefined && compiler !== undefined) {
    return { engine, compiler };
  }
  const unavailable = engine === undefined ? 'no engine binary' : 'no TypeScript 7 compiler';
  if (environment[SWITCH] === 'required') {
    throw new Error(`${SWITCH}=required, but there is ${unavailable}`);
  }
  return { unavailable };
}

export function runTypedChecks(request: TypedChecksRequest): TypedChecksOutcome {
  const { environment } = request;
  if (environment[SWITCH] === 'off') {
    return { unavailable: `${SWITCH}=off` };
  }
  const tools = toolsIn(environment);
  if ('unavailable' in tools) {
    return tools;
  }
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-typed-'));
  try {
    const outcome = engineOutcome(tools, request, folder);
    if (outcome.failed === true && environment[SWITCH] === 'required') {
      throw new Error(`${SWITCH}=required, but ${outcome.unavailable}`);
    }
    return outcome;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
