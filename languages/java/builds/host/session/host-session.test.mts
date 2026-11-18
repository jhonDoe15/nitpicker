import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { machineMemory } from '../../../maven/parallel/tool-slots.mts';
import { startToolHosts } from './host-session.mts';
import { HOST_CONFIG_FILE, hostCap } from '../config/host-config.mts';
import { HOSTS_OFF_VARIABLE, HOSTS_VARIABLE } from '../config/host-environment.config.mts';

const compile = vi.fn();
const roots: string[] = [];
const warnings = vi.fn();

function request(modules: number): Parameters<typeof startToolHosts>[0] {
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-hostsession-'));
  roots.push(work);
  return {
    work,
    modules,
    tools: { effects: ['/asm.jar'] },
    pinned: { asm: '9.9' },
    warn: { write: warnings },
    compile,
  };
}

beforeEach(() => {
  compile.mockReset().mockReturnValue('/host-classes');
  vi.stubEnv(HOSTS_VARIABLE, '');
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('startToolHosts', () => {
  it('does nothing for a project with one module, which has no later module to gain', () => {
    expect(startToolHosts(request(1))).toBeUndefined();
    expect(compile).not.toHaveBeenCalled();
  });

  it('does nothing when hosting is turned off', () => {
    vi.stubEnv(HOSTS_OFF_VARIABLE, '1');

    expect(startToolHosts(request(3))).toBeUndefined();
  });

  it('writes the host configuration and passes the directory down to the tool processes', () => {
    const run = request(3);
    const hosts = startToolHosts(run);
    const directory = process.env[HOSTS_VARIABLE] ?? '';

    expect(directory).toBe(path.join(run.work, 'hosts'));
    expect(JSON.parse(readFileSync(path.join(directory, HOST_CONFIG_FILE), 'utf8'))).toEqual({
      owner: process.pid,
      classpath: '/host-classes',
      maxHosts: hostCap(machineMemory()),
    });
    hosts?.stop();

    expect(process.env[HOSTS_VARIABLE]).toBeUndefined();
  });

  it('restores the directory an outer run had set when it stops', () => {
    vi.stubEnv(HOSTS_VARIABLE, '/outer');
    startToolHosts(request(2))?.stop();

    expect(process.env[HOSTS_VARIABLE]).toBe('/outer');
  });

  it('runs without hosts when the host program cannot be compiled', () => {
    compile.mockImplementation(() => {
      throw new Error('needs JDK 17');
    });
    const run = request(3);

    expect(startToolHosts(run)).toBeUndefined();
    expect(process.env[HOSTS_VARIABLE]).toBeUndefined();
    expect(existsSync(path.join(run.work, 'hosts'))).toBe(false);
  });

  it('says on one line that hosting is off, and why', () => {
    compile.mockImplementation(() => {
      throw new Error('needs JDK 17\nmore detail');
    });
    warnings.mockReset();
    startToolHosts(request(3));
    const lines = warnings.mock.calls.map(([text]) => String(text));

    expect(lines).toEqual([
      'nitpicker: Java tools run in separate JVMs per module (tool hosting is off: needs JDK 17)\n',
    ]);
  });

  it('creates the hosts directory for its owner alone', () => {
    const run = request(3);
    const hosts = startToolHosts(run);
    const mode = statSync(path.join(run.work, 'hosts')).mode % 0o1000;
    hosts?.stop();

    expect(mode).toBe(0o700);
  });
});
