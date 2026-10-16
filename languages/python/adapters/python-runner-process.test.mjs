import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzePythonSnapshot } from './python-runner.mjs';
import { createFakeProjects } from './test-support/fake-project.mjs';

const runner = path.join(import.meta.dirname, 'python-runner.mjs');
const projects = createFakeProjects();

afterEach(projects.cleanup);

function spawnRunner(arguments_, options = {}) {
  return spawnSync(process.execPath, [runner, ...arguments_], { encoding: 'utf8', ...options });
}

describe('the Python runner as a program', () => {
  it('prints one JSON report line, runs the tools in the snapshot and leaves the caller directory alone', () => {
    const root = projects.project({
      'violations.txt': 'F401|src/demo/a.py|`os` imported but unused\n',
    });
    const log = path.join(projects.temporaryRoot(), 'calls.jsonl');
    writeFileSync(log, '');

    const result = spawnRunner(
      ['--part', 'python', '--project-root', root, '--live-root', root, '--snapshot', 'base'],
      { cwd: projects.temporaryRoot(), env: { ...process.env, FAKE_PYTHON_LOG: log } },
    );

    const testRuns = projects
      .calls(log)
      .filter(({ tool, args }) => tool === 'coverage' && args[0] === 'run');
    expect({
      status: result.status,
      stderr: result.stderr,
      lines: result.stdout.split('\n').length,
    }).toEqual({ status: 0, stderr: '', lines: 2 });
    expect(JSON.parse(result.stdout)).toEqual(
      JSON.parse(
        JSON.stringify(
          analyzePythonSnapshot({
            projectRoot: root,
            liveRoot: root,
            settings: {},
            policy: { snapshot: 'base' },
          }),
        ),
      ),
    );
    expect(testRuns.map(({ cwd, pythonPath }) => ({ cwd, pythonPath }))).toEqual([
      { cwd: root, pythonPath: path.join(root, 'src') },
    ]);
  });

  it('exits 2 and says why when the arguments are wrong', () => {
    const result = spawnRunner(['--part', 'lint', '--project-root', '/p']);

    expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({
      status: 2,
      stdout: '',
      stderr: 'Python differential adapter failed: --part must be one of: python, mutation\n',
    });
  });
});
