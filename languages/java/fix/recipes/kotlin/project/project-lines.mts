import { spawnSync } from 'node:child_process';
import { GIT_TIMEOUT_MS } from '../../../../../../shared/processes/deadlines.mjs';

const NO_MATCH = 1;
const OUTPUT_BYTES = 16 * 1024 * 1024;

export type LineSearch = {
  readonly pattern: string;
  readonly files: readonly string[];
  readonly after?: number;
};

export function projectLines(
  projectRoot: string | undefined,
  { pattern, files, after = 0 }: LineSearch,
): readonly string[] | undefined {
  if (projectRoot === undefined) {
    return undefined;
  }
  const result = spawnSync(
    'git',
    [
      ...['grep', '-I', '-h', '-E', '--untracked', `-A${String(after)}`, '-e', pattern, '--'],
      ...files.map((name) => `:(top)${name}`),
    ],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: OUTPUT_BYTES, timeout: GIT_TIMEOUT_MS },
  );
  if (result.error !== undefined || (result.status !== 0 && result.status !== NO_MATCH)) {
    return undefined;
  }
  return result.stdout.split('\n');
}
