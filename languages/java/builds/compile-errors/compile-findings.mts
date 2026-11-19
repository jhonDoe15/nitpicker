import { createIdentityCounter } from '../../../../shared/ingest/common.mjs';
import {
  COMPILE_ERROR_RULE,
  COMPILE_ERROR_TOOL,
  COMPILE_FAILED_SKIPPED_RULE,
  compileErrorMessage,
  hash,
} from '../../../../shared/rules/finding-helpers.mjs';
import { compileErrorsIn } from './compiler-output.mts';
import type { CompileError } from './compiler-output.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import type { JavaFinding } from '../../adapters/typed/java-values.mts';

const identityCounter: () => (identity: string) => string = createIdentityCounter;
const hashOf: (value: string) => string = hash;
const compileErrorText: (text: string) => string = compileErrorMessage;

function isCompileErrors(value: unknown): value is CompileError[] {
  return Array.isArray(value);
}

const PRESET_NAMES: Readonly<Record<string, string>> = { java: 'Java', kotlin: 'Kotlin' };

export function presetLabel(preset = 'java'): string {
  return PRESET_NAMES[preset] ?? preset;
}

export function withCompileErrors(error: Error, output: string, projectRoot: string): Error {
  const errors = compileErrorsIn(output, projectRoot);
  return errors.length === 0
    ? error
    : Object.defineProperty(error, 'compileErrors', { value: errors });
}

export function compileErrorsOf(error: unknown): CompileError[] {
  const chain = new Set<unknown>([error]);
  for (const current of chain) {
    if (!(current instanceof Error)) {
      return [];
    }
    const recorded = fieldOf(current, 'compileErrors');
    if (isCompileErrors(recorded)) {
      return recorded;
    }
    chain.add(current.cause);
  }
  return [];
}

function skippedNotice(count: number, preset: string): JavaFinding {
  const errors = count === 1 ? '1 compile error' : `${String(count)} compile errors`;
  return {
    tool: preset,
    rule: COMPILE_FAILED_SKIPPED_RULE,
    path: '.',
    identity: COMPILE_FAILED_SKIPPED_RULE,
    message:
      `The change does not compile (${errors}), so the build stopped and the other ` +
      `${presetLabel(preset)} checks did not run. ` +
      `Fix the ${COMPILE_ERROR_TOOL}/${COMPILE_ERROR_RULE} findings and rerun.`,
    classification: 'tool-error',
  };
}

export function compileErrorFindings(
  errors: readonly CompileError[],
  preset: string,
): JavaFinding[] {
  const next = identityCounter();
  return [
    ...errors.map(({ path, line, column, message }) => ({
      tool: COMPILE_ERROR_TOOL,
      rule: COMPILE_ERROR_RULE,
      path,
      identity: next(`${COMPILE_ERROR_RULE}:${hashOf(message)}`),
      message: compileErrorText(message),
      classification: 'enforceable',
      location: column === undefined ? { line } : { line, column },
    })),
    skippedNotice(errors.length, preset),
  ];
}
