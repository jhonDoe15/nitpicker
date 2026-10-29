import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { oxlintBinary } from '../oxlint-process.mjs';

const MAX_LISTING_BYTES = 64 * 1024 * 1024;

export async function listNativeRules() {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [oxlintBinary(), '--rules', '--format', 'json'],
    { cwd: tmpdir(), maxBuffer: MAX_LISTING_BYTES },
  );
  return JSON.parse(stdout);
}
