import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDeadline, createMavenRunner, mavenTarget } from './maven-command.mjs';

const roots = [];

function project(wrapper) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-command-'));
  roots.push(root);
  if (wrapper !== undefined) {
    writeFileSync(path.join(root, 'mvnw'), '#!/bin/sh\n');
    chmodSync(path.join(root, 'mvnw'), wrapper);
  }
  return root;
}

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe.skipIf(process.platform === 'win32')('mavenTarget', () => {
  const args = ['-B', 'test'];

  it('prefers the configured command', () => {
    expect(mavenTarget({ projectRoot: project(0o755), configured: './my-mvn', args })).toEqual({
      command: './my-mvn',
      args,
      shell: false,
    });
  });

  it('uses the executable wrapper of the project as an absolute path', () => {
    const root = project(0o755);

    expect(mavenTarget({ projectRoot: root, args })).toEqual({
      command: path.join(root, 'mvnw'),
      args,
      shell: false,
    });
  });

  it('runs a wrapper without the executable bit through sh', () => {
    const root = project(0o644);

    expect(mavenTarget({ projectRoot: root, args })).toEqual({
      command: 'sh',
      args: [path.join(root, 'mvnw'), ...args],
      shell: false,
    });
  });

  it('falls back to mvn on the PATH', () => {
    expect(mavenTarget({ projectRoot: project(), args })).toEqual({
      command: 'mvn',
      args,
      shell: false,
    });
  });

  it('runs mvn through the shell on Windows when there is no wrapper', () => {
    const root = project();

    expect(mavenTarget({ projectRoot: root, args, platform: 'win32' })).toEqual({
      command: 'mvn',
      args,
      shell: true,
    });
  });
});

describe('createMavenRunner', () => {
  const deadline = createDeadline(60_000);

  function runnerWith(result) {
    const calls = [];
    const run = createMavenRunner({
      projectRoot: '/work/project',
      configured: 'mvn',
      deadline,
      spawn: (command, args, options) => {
        calls.push({ command, args, options });
        return result;
      },
    });
    return { run, calls };
  }

  it('runs Maven quietly in batch mode inside the project and returns its output', () => {
    const { run, calls } = runnerWith({ status: 0, stdout: 'done', stderr: '' });

    expect(run(['test'])).toBe('done');
    expect(calls[0].command).toBe('mvn');
    expect(calls[0].args).toEqual(['-B', '-q', 'test']);
    expect(calls[0].options.cwd).toBe('/work/project');
  });

  it('names the step and keeps Maven diagnostics when it fails, without JVM notices', () => {
    const { run } = runnerWith({
      status: 1,
      stdout: '[ERROR] COMPILATION ERROR : Foo.java:[3,1] boom',
      stderr: 'Picked up JAVA_TOOL_OPTIONS: -Xmx1g',
    });

    expect(() => run(['test'], { label: 'Maven compile' })).toThrow(
      'Maven compile failed in /work/project: [ERROR] COMPILATION ERROR : Foo.java:[3,1] boom',
    );
    expect(() => run(['test'])).not.toThrow(/Picked up/u);
  });

  it('rethrows a launch error such as a missing mvn', () => {
    const { run } = runnerWith({ error: new Error('spawn mvn ENOENT') });

    expect(() => run(['test'])).toThrow('spawn mvn ENOENT');
  });

  it('stops when the time budget is used up', () => {
    let now = 0;
    const budget = createDeadline(100, () => now);
    now = 101;

    expect(() => budget.remaining()).toThrow('time budget');
  });
});
