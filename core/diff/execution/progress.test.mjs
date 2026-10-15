import { expectedOutput107_56 } from '../fixtures/expected-output/core-diff-progress.mjs';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runTasksInProcess } from '../fixtures/in-process-analyzers.mjs';
import {
  cachedLine,
  createProgressReporter,
  formatDuration,
  reportingProgress,
  startLine,
  writeToDescriptor,
} from './progress.mjs';
import { runAnalyzers, runScheduler } from './run-analyzers.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function analyzer(
  name,
  { script = 'process.stdout.write(\'{"findings":[]}\')', dependencies } = {},
) {
  return {
    name,
    version: '1',
    configurationHash: 'hash',
    exclusions: [],
    dependencies,
    createInvocation: () => ({
      command: process.execPath,
      args: ['-e', script],
      cwd: process.cwd(),
    }),
  };
}

function collectingStream() {
  const stream = { text: '', write: (line) => (stream.text += line) };
  return stream;
}

describe('progress lines', () => {
  it('formats durations as seconds, then minutes and seconds', () => {
    expect([0, 400, 41_000, 59_600, 125_000].map(formatDuration)).toEqual([
      '<1s',
      '<1s',
      '41s',
      '1m00s',
      '2m05s',
    ]);
  });

  it('labels the phase, counts finished analyzers and leaves out quick successes', () => {
    const lines = [];
    const reportSettled = createProgressReporter({
      write: (line) => lines.push(line),
      label: 'head',
      total: 4,
    });

    reportSettled({ name: 'eslint-lint', status: 'done', elapsedMs: 41_000 });
    reportSettled({ name: 'prettier-format', status: 'done', elapsedMs: 9_000 });
    reportSettled({ name: 'coverage', status: 'failed', elapsedMs: 3_000 });
    reportSettled({ name: 'mutation', status: 'skipped', because: 'coverage' });

    expect(lines).toEqual([
      'nitpicker: head eslint-lint done (41s), 1 of 4\n',
      'nitpicker: head coverage failed (3s), 3 of 4\n',
      'nitpicker: head mutation skipped (coverage failed), 4 of 4\n',
    ]);
  });

  it('words the start and cached lines per phase', () => {
    expect(startLine({ label: 'head', total: 9 })).toBe('nitpicker: head: running 9 analyzers\n');
    expect(startLine({ label: 'base', total: 1 })).toBe('nitpicker: base: running 1 analyzer\n');
    expect(cachedLine({ label: 'base', count: 7 })).toBe('nitpicker: base 7 analyzers cached\n');
  });
});

describe('progress on a descriptor', () => {
  it('writes the reporter lines to the descriptor it is given', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-progress-'));
    temporaryRoots.push(directory);
    const file = path.join(directory, 'stderr.txt');
    const descriptor = openSync(file, 'w');
    const reportSettled = createProgressReporter({
      write: (line) => writeToDescriptor(line, descriptor),
      label: 'head',
      total: 2,
    });

    reportSettled({ name: 'lint', status: 'done', elapsedMs: 41_000 });
    reportSettled({ name: 'mutation', status: 'skipped', because: 'tests' });
    closeSync(descriptor);

    expect(readFileSync(file, 'utf8')).toBe(
      'nitpicker: head lint done (41s), 1 of 2\nnitpicker: head mutation skipped (tests failed), 2 of 2\n',
    );
  });

  it('reports a descriptor that is not open instead of throwing', () => {
    expect(writeToDescriptor('line\n', 2_147_483_646)).toEqual(expectedOutput107_56());
  });
});

describe('progress during runAnalyzers', () => {
  const root = process.cwd();
  const options = (extra) => ({
    projectRoot: root,
    policyRoot: root,
    toolRoot: root,
    liveProjectRoot: root,
    snapshot: 'head',
    ...extra,
  });

  it('prints a start line, then a line per failed or skipped analyzer', () => {
    const stream = collectingStream();

    runAnalyzers(
      options({
        analyzers: [
          analyzer('coverage', { script: 'process.exit(3)' }),
          analyzer('mutation', { dependencies: ['coverage'] }),
          analyzer('lint'),
        ],
        runTasks: reportingProgress(runTasksInProcess, stream),
      }),
    );

    const lines = stream.text.split('\n').filter(Boolean);
    expect(lines[0]).toBe('nitpicker: head: running 3 analyzers');
    expect(lines.slice(1)).toEqual([
      expect.stringMatching(/^nitpicker: head coverage failed \(<1s\), 1 of 3$/u),
      'nitpicker: head mutation skipped (coverage failed), 2 of 3',
    ]);
  });

  it('prints nothing when no analyzer runs', () => {
    const stream = collectingStream();

    runAnalyzers(
      options({
        analyzers: [],
        runTasks: reportingProgress(runTasksInProcess, stream),
      }),
    );

    expect(stream.text).toBe('');
  });

  it('streams lines from the real scheduler process to the stream descriptor', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-progress-'));
    temporaryRoots.push(directory);
    const file = path.join(directory, 'stderr.txt');
    const descriptor = openSync(file, 'w');
    const stream = { fd: descriptor, write: (line) => writeSync(descriptor, line) };

    try {
      const run = runAnalyzers(
        options({
          analyzers: [analyzer('lint', { script: 'process.exit(3)' }), analyzer('format')],
          snapshot: 'base',
          runTasks: reportingProgress(runScheduler, stream),
        }),
      );
      expect(run.toolErrors).toHaveLength(1);
    } finally {
      closeSync(descriptor);
    }

    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    expect(lines[0]).toBe('nitpicker: base: running 2 analyzers');
    expect(lines.slice(1)).toEqual([
      expect.stringMatching(/^nitpicker: base lint failed \((?:\d+s|<1s)\), [12] of 2$/u),
    ]);
  });
});
