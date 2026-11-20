import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { machineMemory } from '../../../../../shared/processes/machine-capacity.mts';
import { HOST_CONFIG_FILE, hostCap } from '../config/host-config.mts';
import { HOSTS_OFF_VARIABLE } from '../config/host-environment.config.mts';
import {
  HOSTS_PROPERTY,
  PENDING_FILE,
  openGradleHosts,
  prepareGradleHosts,
  readPendingHosts,
} from './gradle-hosts.mts';

const roots: string[] = [];
const warnings = vi.fn();
const PROPERTY = `-P${HOSTS_PROPERTY}=`;

function directoryOf(hosts: ReturnType<typeof openGradleHosts>): string {
  return (hosts.arguments[0] ?? '').slice(PROPERTY.length);
}

function pendingDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradlehosts-'));
  roots.push(directory);
  writeFileSync(
    path.join(directory, PENDING_FILE),
    JSON.stringify({ owner: 41, maxHosts: 5, timeoutMs: 9000 }),
  );
  return directory;
}

afterEach(() => {
  vi.unstubAllEnvs();
  warnings.mockReset();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('openGradleHosts', () => {
  it('hands Gradle a private directory that names this process as the owner of its hosts', () => {
    const hosts = openGradleHosts({ timeoutMs: 9000, warn: { write: warnings } });
    const directory = directoryOf(hosts);
    roots.push(directory);

    expect(hosts.arguments).toEqual([`${PROPERTY}${directory}`]);
    expect(readPendingHosts(directory)).toEqual({
      owner: process.pid,
      maxHosts: hostCap(machineMemory()),
      timeoutMs: 9000,
    });
    expect(existsSync(path.join(directory, HOST_CONFIG_FILE))).toBe(false);
  });

  it('removes the directory when the build is over', () => {
    const hosts = openGradleHosts({ timeoutMs: 0, warn: { write: warnings } });
    const directory = directoryOf(hosts);

    hosts.stop();

    expect(existsSync(directory)).toBe(false);
    expect(() => {
      hosts.stop();
    }).not.toThrow();
  });

  it('passes Gradle nothing when hosting is turned off', () => {
    vi.stubEnv(HOSTS_OFF_VARIABLE, '1');

    const hosts = openGradleHosts({ timeoutMs: 0, warn: { write: warnings } });

    expect(hosts.arguments).toEqual([]);
    expect(warnings).not.toHaveBeenCalled();
  });
});

describe('readPendingHosts', () => {
  it('reads nothing from a directory another run did not open', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradlehosts-'));
    roots.push(directory);

    expect(readPendingHosts(directory)).toBeUndefined();
  });
});

describe('prepareGradleHosts', () => {
  it('leaves a configuration that is already written alone', () => {
    const directory = pendingDirectory();
    const written = JSON.stringify({ owner: 7, classpath: '/classes', maxHosts: 2 });
    writeFileSync(path.join(directory, HOST_CONFIG_FILE), written);

    prepareGradleHosts({ directory, libraries: [], java: '/missing/java' });

    expect(readFileSync(path.join(directory, HOST_CONFIG_FILE), 'utf8')).toBe(written);
  });

  it('refuses a directory this run did not open', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradlehosts-'));
    roots.push(directory);

    expect(() => {
      prepareGradleHosts({ directory, libraries: [], java: '/missing/java' });
    }).toThrow('is not a tool host directory of this run');
  });

  it('refuses a directory other users can write to', () => {
    const directory = pendingDirectory();
    chmodSync(directory, 0o777);

    expect(() => {
      prepareGradleHosts({ directory, libraries: [], java: '/missing/java' });
    }).toThrow('is not a tool host directory of this run');
  });
});
