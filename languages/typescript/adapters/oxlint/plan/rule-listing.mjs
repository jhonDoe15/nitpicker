import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { oxlintBinary } from '../oxlint-process.mjs';
import { PROBE_TIMEOUT_MS } from '../../../../../shared/processes/deadlines.mjs';

const MAX_LISTING_BYTES = 64 * 1024 * 1024;

export async function listNativeRules() {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [oxlintBinary(), '--rules', '--format', 'json', import.meta.filename],
    { cwd: import.meta.dirname, maxBuffer: MAX_LISTING_BYTES, timeout: PROBE_TIMEOUT_MS },
  );
  return JSON.parse(stdout);
}
