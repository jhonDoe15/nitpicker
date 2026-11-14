import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runNodeTool } from '../tooling.mts';

const directories = [];

function killedTool(stderr) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-tooling-'));
  directories.push(root);
  const script = path.join(root, 'tool.mjs');
  writeFileSync(
    script,
    `console.error(${JSON.stringify(stderr)});\nprocess.kill(process.pid, 'SIGKILL');\n`,
  );
  return () =>
    runNodeTool({
      options: { kind: 'knip', projectRoot: root, liveProjectRoot: root },
      absoluteToolPath: script,
      arguments_: [],
      acceptedStatuses: [0],
    });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === 'win32')('runNodeTool', () => {
  it('names the signal, not the warning printed at startup', () => {
    const run = killedTool('(node:1) ExperimentalWarning: something is old');

    expect(run).toThrow(/^knip was killed by SIGKILL \(usually the out-of-memory killer/u);
    expect(run).not.toThrow(/ExperimentalWarning/u);
  });
});
