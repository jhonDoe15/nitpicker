import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { neutralGit } from './git-command.mts';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: vi.fn() };
});

function spawnOutcome(overrides: Partial<SpawnSyncReturns<string>> = {}): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [null, '', ''],
    stdout: '',
    stderr: '',
    status: 0,
    signal: null,
    ...overrides,
  };
}

function spawnError(code: string): Error {
  return Object.assign(new Error(`spawn env ${code}`), { code });
}

beforeEach(() => {
  vi.mocked(spawnSync).mockReset();
});

describe('neutralGit transient spawn retries', () => {
  it('retries ENOMEM and succeeds when a subsequent attempt works', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(spawnOutcome({ status: null, error: spawnError('ENOMEM') }))
      .mockReturnValueOnce(spawnOutcome({ status: 0, stdout: 'ok\n' }));

    expect(neutralGit('/repo', ['status'])).toEqual({ status: 0, stdout: 'ok\n' });
    expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(2);
  });

  it('retries EAGAIN up to two times before succeeding', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(spawnOutcome({ status: null, error: spawnError('EAGAIN') }))
      .mockReturnValueOnce(spawnOutcome({ status: null, error: spawnError('EAGAIN') }))
      .mockReturnValueOnce(spawnOutcome({ status: 0, stdout: 'recovered\n' }));

    expect(neutralGit('/repo', ['status'])).toEqual({ status: 0, stdout: 'recovered\n' });
    expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(3);
  });

  it('stops retrying after two retries and throws the ENOMEM error', () => {
    vi.mocked(spawnSync).mockReturnValue(
      spawnOutcome({ status: null, error: spawnError('ENOMEM') }),
    );

    expect(() => neutralGit('/repo', ['status'])).toThrow(/Cannot run git in \/repo: .*ENOMEM/u);
    expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(3);
  });
});
