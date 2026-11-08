import { createIdentityCounter } from '../../../../shared/ingest/common.mjs';
import {
  COMPILE_ERROR_RULE,
  COMPILE_ERROR_TOOL,
  COMPILE_FAILED_SKIPPED_RULE,
  compileErrorMessage,
  hash,
} from '../../../../shared/rules/finding-helpers.mjs';
import { compileErrorsIn } from './compiler-output.mjs';

const PRESET_NAMES = { java: 'Java', kotlin: 'Kotlin' };

export function presetLabel(preset = 'java') {
  return PRESET_NAMES[preset] ?? preset;
}

export function withCompileErrors(error, output, projectRoot) {
  const errors = compileErrorsIn(output, projectRoot);
  return errors.length === 0
    ? error
    : Object.defineProperty(error, 'compileErrors', { value: errors });
}

export function compileErrorsOf(error) {
  const chain = [error];
  for (const current of chain) {
    if (!(current instanceof Error)) {
      return [];
    }
    if (current.compileErrors !== undefined) {
      return current.compileErrors;
    }
    if (!chain.includes(current.cause)) {
      chain.push(current.cause);
    }
  }
  return [];
}

function skippedNotice(count, preset) {
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

export function compileErrorFindings(errors, preset) {
  const next = createIdentityCounter();
  return [
    ...errors.map(({ path, line, column, message }) => ({
      tool: COMPILE_ERROR_TOOL,
      rule: COMPILE_ERROR_RULE,
      path,
      identity: next(`${COMPILE_ERROR_RULE}:${hash(message)}`),
      message: compileErrorMessage(message),
      classification: 'enforceable',
      location: column === undefined ? { line } : { line, column },
    })),
    skippedNotice(errors.length, preset),
  ];
}
