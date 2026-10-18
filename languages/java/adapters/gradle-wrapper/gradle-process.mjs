import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SUPERVISOR = fileURLToPath(new URL('./gradle-supervisor.mjs', import.meta.url));
const JSON_OVERHEAD = 6;

export function runGradle(command, args, options) {
  const result = spawnSync(process.execPath, [SUPERVISOR], {
    input: JSON.stringify({ command, args, options }),
    encoding: 'utf8',
    maxBuffer: options.maxBuffer * JSON_OVERHEAD + 4096,
  });
  if (result.error !== undefined || result.status !== 0) {
    return result;
  }
  const output = JSON.parse(result.stdout);
  return {
    ...output,
    error:
      output.error === undefined
        ? undefined
        : Object.assign(new Error(output.error.message), { code: output.error.code }),
  };
}
