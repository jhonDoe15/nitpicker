import { spawnSyncWithOutputFile } from '../../../../core/tooling/output-file/output-file.mjs';
import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { fieldOf, fieldsOf, textOf } from '../../../../shared/values/readers.mts';
import { callUntyped, optionalText } from '../typed/java-values.mts';

export type GradleResult = {
  readonly status?: unknown;
  readonly stdout?: string | undefined;
  readonly stderr?: string | undefined;
  readonly error?: unknown;
  readonly [field: string]: unknown;
};
export type GradleOptions = {
  readonly cwd: string;
  readonly encoding: 'utf8';
  readonly maxBuffer: number;
  readonly shell: unknown;
  readonly timeout: number | undefined;
  readonly spawn?: unknown;
};

export const SUPERVISOR = fileURLToPath(
  textOf(checkoutModuleUrl(new URL('./gradle-supervisor.mjs', import.meta.url))),
);
const JSON_OVERHEAD = 6;
const ENVELOPE_OVERHEAD_BYTES = 4096;

function gradleResultOf(value: unknown): GradleResult {
  const fields = fieldsOf(value);
  return {
    ...fields,
    stdout: optionalText(fields['stdout']),
    stderr: optionalText(fields['stderr']),
  };
}

function supervisorError(error: unknown): Error | undefined {
  return error === undefined
    ? undefined
    : Object.assign(new Error(textOf(fieldOf(error, 'message'))), {
        code: fieldOf(error, 'code'),
      });
}

export function runGradle(
  command: string,
  args: readonly string[],
  { spawn = spawnSyncWithOutputFile, ...options }: GradleOptions,
): GradleResult {
  const result = callUntyped(spawn, process.execPath, [SUPERVISOR], {
    input: JSON.stringify({ command, args, options }),
    encoding: 'utf8',
    maxBuffer: options.maxBuffer * JSON_OVERHEAD + ENVELOPE_OVERHEAD_BYTES,
  });
  if (fieldOf(result, 'error') !== undefined || fieldOf(result, 'status') !== 0) {
    return gradleResultOf(result);
  }
  const output: unknown = JSON.parse(textOf(fieldOf(result, 'stdout')));
  return { ...gradleResultOf(output), error: supervisorError(fieldOf(output, 'error')) };
}
