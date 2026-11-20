import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOSTS_VARIABLE } from '../config/host-environment.config.mts';
import { answer } from './host-job.mts';

const JOB = {
  java: '/jdk/bin/java',
  jvmArgs: [],
  classpath: ['/pmd.jar'],
  mainClass: 'net.sourceforge.pmd.cli.PmdCli',
  args: ['check'],
  cwd: '/project',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('answer', () => {
  it('hosts nothing when the build passed no hosts directory', () => {
    vi.stubEnv(HOSTS_VARIABLE, '');

    expect(answer('run', JOB)).toEqual({ hosted: false });
  });

  it('hosts nothing in a directory that holds no host configuration', () => {
    vi.stubEnv(HOSTS_VARIABLE, '/missing/hosts');

    expect(answer('run', JOB)).toEqual({ hosted: false });
    expect(answer('tool', { command: '/jdk/bin/jdeps', args: [], cwd: '/project' })).toEqual({
      hosted: false,
    });
  });

  it('rejects a command it does not know', () => {
    vi.stubEnv(HOSTS_VARIABLE, '/missing/hosts');

    expect(() => answer('stop', JOB)).toThrow('host-job needs prepare, run or tool');
  });
});
