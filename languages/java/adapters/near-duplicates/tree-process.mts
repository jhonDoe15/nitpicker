import { spawnSync } from 'node:child_process';

type TreeProcess = { readonly script: string; readonly request: unknown; readonly subject: string };

const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 2 ** 30;

export function runTreeProcess({ script, request, subject }: TreeProcess): unknown {
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: TIMEOUT_MS,
  });
  if (result.status !== 0) {
    const reason = result.error?.message ?? result.stderr.trim().split('\n').at(-1) ?? 'no output';
    throw new Error(
      `Reading ${subject} syntax trees for near-duplicate detection failed: ${reason}`,
    );
  }
  return JSON.parse(result.stdout);
}
