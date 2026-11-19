import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fallback = vi.fn();

const { hasRelativePath, hostedRun, hostedSpawnFor, onlyPlainOptions, privateDirectory } =
  await import('./host-client.mts');

import { HOST_CONFIG_FILE, PLAIN_TOOL } from '../config/host-config.mts';

const ALLOWED = { 'probe.Probe': PLAIN_TOOL };
const roots: string[] = [];

afterAll(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  fallback.mockReset();
  vi.stubEnv('NITPICKER_NO_TOOL_HOSTS', '');
  vi.unstubAllEnvs();
  vi.stubEnv('XDG_CACHE_HOME', temporary('nitpicker-hostclient-cache-'));
});

function temporary(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function fakeJava(version: string, { starts = true } = {}): string {
  const file = path.join(temporary('nitpicker-hostclient-java-'), 'java');
  const body = starts ? 'sleep 30' : 'exit 1';
  writeFileSync(
    file,
    `#!/bin/sh\nif [ "$1" = -version ]; then echo 'openjdk version "${version}"' >&2; exit 0; fi\n${body}\n`,
  );
  chmodSync(file, 0o755);
  return file;
}

function hostsDirectoryWithConfig(): string {
  const directory = path.join(temporary('nitpicker-hostclient-run-'), 'hosts');
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
  writeFileSync(
    path.join(directory, HOST_CONFIG_FILE),
    JSON.stringify({ owner: process.pid, classpath: '/none', maxHosts: 4 }),
  );
  vi.stubEnv('NITPICKER_TOOL_HOSTS', directory);
  return directory;
}

function withSources(): string {
  const root = temporary('nitpicker-hostclient-module-');
  mkdirSync(path.join(root, 'src'));
  return root;
}

function run(java: string, args: readonly string[] = ['echo']) {
  return { java, classpath: ['/tools'], mainClass: 'probe.Probe', args, cwd: tmpdir() };
}

describe('hasRelativePath', () => {
  const cwd = temporary('nitpicker-hostclient-cwd-');
  mkdirSync(path.join(cwd, 'src'));

  it.each([
    [['--dir', 'src'], true],
    [['--dir', `${cwd}/src,src`], true],
    [['--files=src'], true],
    [['--format', 'sarif', '--dir', path.join(cwd, 'src')], false],
    [['--rulesets', '/rules/a.xml,/rules/b.xml'], false],
    [['-c', 'missing'], false],
  ])('for %j is %s', (args, relative) => {
    expect(hasRelativePath(args, cwd)).toBe(relative);
  });
});

describe('onlyPlainOptions', () => {
  it.each([
    [{ cwd: '/w', encoding: 'utf8', timeout: 5, maxBuffer: 9 }, true],
    [{ cwd: '/w', env: { A: '1' } }, false],
    [{ cwd: '/w', input: 'text' }, false],
    [{ cwd: '/w', stdio: 'inherit' }, false],
  ])('for %j is %s', (options, plain) => {
    expect(onlyPlainOptions(options)).toBe(plain);
  });

  it('takes the extra options a caller can serve', () => {
    expect(onlyPlainOptions({ cwd: '/w', stdio: 'pipe' }, ['stdio'])).toBe(true);
  });
});

describe('privateDirectory', () => {
  it('accepts a directory only its owner can use, and refuses one others can read', () => {
    const own = temporary('nitpicker-hostclient-private-');
    chmodSync(own, 0o700);
    const open = temporary('nitpicker-hostclient-open-');
    chmodSync(open, 0o755);

    expect(privateDirectory(own)).toBe(true);
    expect(privateDirectory(open)).toBe(false);
    expect(privateDirectory(path.join(own, 'missing'))).toBe(false);
  });
});

describe('hostedSpawnFor', () => {
  it('leaves every job to a plain spawn when the run set up no hosts', () => {
    expect(hostedSpawnFor({ ...run('java'), mainClass: 'net.sourceforge.pmd.cli.PmdCli' })).toBe(
      undefined,
    );
  });

  it('spawns plainly when the caller passes an environment, input or stdio of its own', () => {
    hostsDirectoryWithConfig();
    fallback.mockReturnValue({ status: 0, stdout: 'plain', stderr: '' });
    const spawn = hostedSpawnFor({ ...run('java'), mainClass: 'StructureMetrics' }, fallback);
    spawn?.('java', ['@args'], { encoding: 'utf8', env: { A: '1' } });

    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('leaves tools that are not on the list to a plain spawn', () => {
    hostsDirectoryWithConfig();

    expect(hostedSpawnFor(run('java'))).toBeUndefined();
  });

  it('spawns plainly when the run wrote no host configuration', () => {
    const directory = hostsDirectoryWithConfig();
    rmSync(path.join(directory, HOST_CONFIG_FILE));
    fallback.mockReturnValue({ status: 0, stdout: 'plain', stderr: '' });
    const spawn = hostedSpawnFor({ ...run('java'), mainClass: 'StructureMetrics' }, fallback);

    expect(spawn?.('java', ['@args'], { encoding: 'utf8' })).toEqual({
      status: 0,
      stdout: 'plain',
      stderr: '',
    });
    expect(fallback).toHaveBeenCalledWith('java', ['@args'], { encoding: 'utf8' });
  });
});

describe('hostedRun', () => {
  it('declines without hosts, for a tool not allowed, and for a relative path argument', () => {
    expect(hostedRun(run(fakeJava('21.0.1')), 1000, ALLOWED)).toBeUndefined();
    hostsDirectoryWithConfig();

    expect(hostedRun(run(fakeJava('21.0.1')), 1000, {})).toBeUndefined();
    expect(hostedRun({ ...run(fakeJava('21.0.1')), cwd: '.' }, 1000, ALLOWED)).toBeUndefined();
    expect(
      hostedRun({ ...run(fakeJava('21.0.1'), ['src']), cwd: withSources() }, 1000, ALLOWED),
    ).toBeUndefined();
  });

  it('declines a java older than 17, which has no Unix domain sockets to host with', () => {
    hostsDirectoryWithConfig();

    expect(hostedRun(run(fakeJava('11.0.2')), 1000, ALLOWED)).toBeUndefined();
  });

  it('declines when the host JVM does not start, so the caller spawns the tool itself', () => {
    hostsDirectoryWithConfig();

    expect(hostedRun(run(fakeJava('21.0.1', { starts: false })), 5000, ALLOWED)).toBeUndefined();
  });
});
