import { describe, expect, it } from 'vitest';
import { failureText, fixSpawn, fixerError, runFixCommand } from './fix-command.mjs';

const BASE = {
  operation: 'demo-fix',
  command: process.execPath,
  cwd: process.cwd(),
  acceptedStatuses: [0],
};

describe('runFixCommand', () => {
  it('hands the invocation to the injected executor and returns its result', () => {
    const seen = [];
    const result = runFixCommand({
      ...BASE,
      args: ['-v'],
      environment: { DEMO: '1' },
      input: 'text',
      executeFixCommand: (invocation) => {
        seen.push(invocation);
        return { status: 0, stdout: 'done' };
      },
    });

    expect(result.stdout).toBe('done');
    expect(seen).toEqual([
      {
        operation: 'demo-fix',
        command: process.execPath,
        args: ['-v'],
        cwd: process.cwd(),
        acceptedStatuses: [0],
        environment: { DEMO: '1' },
        input: 'text',
      },
    ]);
  });
  it('hands over the shell flag only when the command needs a shell', () => {
    const seen = [];
    const executeFixCommand = (invocation) => {
      seen.push(invocation.shell);
      return { status: 0 };
    };

    runFixCommand({ ...BASE, args: [], executeFixCommand });
    runFixCommand({ ...BASE, args: [], shell: true, executeFixCommand });

    expect(seen).toEqual([undefined, true]);
  });
  it('names the operation and the standard error when the status is not accepted', () => {
    expect(() =>
      runFixCommand({
        ...BASE,
        args: [],
        executeFixCommand: () => ({ status: 2, stderr: ' boom \n' }),
      }),
    ).toThrow('demo-fix failed: boom');
  });
  it('accepts every status the caller lists', () => {
    const result = runFixCommand({
      ...BASE,
      acceptedStatuses: [0, 1],
      args: [],
      executeFixCommand: () => ({ status: 1, stdout: 'x' }),
    });

    expect(result.status).toBe(1);
  });
  it('fails on a spawn error even when the status looks accepted', () => {
    expect(() =>
      runFixCommand({
        ...BASE,
        args: [],
        executeFixCommand: () => ({ status: 0, error: new Error('spawn demo ENOENT') }),
      }),
    ).toThrow('demo-fix failed: spawn demo ENOENT');
  });
  it('lets the caller describe a failure', () => {
    expect(() =>
      runFixCommand({
        ...BASE,
        args: [],
        executeFixCommand: () => ({ status: 3 }),
        describe: (result) => `custom ${result.status}`,
      }),
    ).toThrow('demo-fix failed: custom 3');
  });
});

describe('fixSpawn', () => {
  it('turns a spawn call into an invocation that keeps the timeout, the shell and the environment', () => {
    const seen = [];
    const spawn = fixSpawn({
      operation: 'demo-tools',
      executeFixCommand: (invocation) => {
        seen.push(invocation);
        return { status: 0 };
      },
    });

    spawn('mvnw.cmd', ['-q'], { cwd: '/p', env: { A: '1' }, shell: true, timeout: 9 });
    spawn('java', ['-version']);

    expect(seen).toEqual([
      {
        operation: 'demo-tools',
        command: 'mvnw.cmd',
        args: ['-q'],
        cwd: '/p',
        acceptedStatuses: [0],
        environment: { A: '1' },
        input: undefined,
        shell: true,
        timeout: 9,
      },
      {
        operation: 'demo-tools',
        command: 'java',
        args: ['-version'],
        cwd: undefined,
        acceptedStatuses: [0],
        environment: {},
        input: undefined,
      },
    ]);
  });
});

describe('failureText', () => {
  it('prefers the spawn error, then the standard error, then the exit status', () => {
    expect(failureText({ error: new Error('no such file'), stderr: 'x' })).toBe('no such file');
    expect(failureText({ status: 4, stderr: ' bad \n' })).toBe('bad');
    expect(failureText({ status: 4, stderr: '' })).toBe('exit 4');
    expect(failureText({ status: 5 })).toBe('exit 5');
  });
  it('drops the lines a JVM prints about its environment', () => {
    const stderr =
      'Picked up JAVA_TOOL_OPTIONS: -Dx=1\nNOTE: Picked up _JAVA_OPTIONS: y\nreal problem\n';

    expect(failureText({ status: 1, stderr })).toBe('real problem');
    expect(failureText({ status: 1, stderr: 'Picked up JAVA_TOOL_OPTIONS: -Dx=1\n' })).toBe(
      'exit 1',
    );
  });
});

describe('fixerError', () => {
  it('reports a tool error for the fix snapshot from an error or a plain value', () => {
    expect(fixerError('demo-fix', new Error('broken'))).toEqual({
      tool: 'demo-fix',
      snapshot: 'fix',
      message: 'broken',
    });
    expect(fixerError('demo-fix', 'text')).toEqual({
      tool: 'demo-fix',
      snapshot: 'fix',
      message: 'text',
    });
  });
});
