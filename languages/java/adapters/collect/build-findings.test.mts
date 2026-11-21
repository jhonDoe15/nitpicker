import type { SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  rmSync: vi.fn<typeof import('node:fs').rmSync>(),
  actualRmSync: undefined as typeof import('node:fs').rmSync | undefined,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  fsMock.actualRmSync = actual.rmSync;
  fsMock.rmSync.mockImplementation(actual.rmSync);
  return { ...actual, rmSync: fsMock.rmSync };
});

import { buildFindings } from './build-findings.mts';
import {
  fieldOf,
  messageOf,
  parseJson,
  textOf,
  textsOf,
} from '../../../../shared/values/readers.mts';

const roots: string[] = [];
const DAEMON_DISAPPEARED =
  'Gradle build daemon disappeared unexpectedly (it may have been killed or may have crashed)';
const REPORT_PREFIX = '-Pnitpicker.reportDir=';

function spawnReturn(envelope: {
  readonly status: number;
  readonly stdout?: string;
  readonly stderr?: string;
}): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: ['', '', ''],
    stdout: JSON.stringify({ stdout: '', stderr: '', ...envelope }),
    stderr: '',
    status: 0,
    signal: null,
  };
}

function gradleProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-build-findings-'));
  roots.push(root);
  writeFileSync(path.join(root, 'settings.gradle'), '');
  return root;
}

function reportDirFrom(options: unknown): string {
  const args = textsOf(fieldOf(parseJson(textOf(fieldOf(options, 'input'))), 'args'));
  const flag = args.find((entry) => entry.startsWith(REPORT_PREFIX));
  if (flag === undefined) {
    throw new Error('Expected -Pnitpicker.reportDir argument');
  }
  return flag.slice(REPORT_PREFIX.length);
}

function writeEmptyModuleReport(reportBase: string): void {
  const moduleRoot = path.join(reportBase, 'root');
  mkdirSync(moduleRoot, { recursive: true });
  writeFileSync(
    path.join(reportBase, 'modules.json'),
    JSON.stringify([{ key: 'root', path: ':', dir: '' }]),
  );
  writeFileSync(
    path.join(moduleRoot, 'manifest.json'),
    JSON.stringify({ sourceRoots: [], testSourceRoots: [], resourceRoots: [] }),
  );
}

function failReportRemoval(code: string, message: string): void {
  const actual = fsMock.actualRmSync;
  fsMock.rmSync.mockImplementation((target, options) => {
    const targetPath = String(target);
    if (path.basename(targetPath).startsWith('nitpicker-java-reports-')) {
      roots.push(targetPath);
      throw Object.assign(new Error(message), { code });
    }
    actual?.(target, options);
  });
}

afterEach(() => {
  fsMock.rmSync.mockReset();
  if (fsMock.actualRmSync !== undefined) {
    fsMock.rmSync.mockImplementation(fsMock.actualRmSync);
  }
  for (const root of roots.splice(0)) {
    fsMock.actualRmSync?.(root, { recursive: true, force: true });
  }
});

describe('buildFindings report cleanup', () => {
  it('keeps the Gradle memory failure when removing the temporary report folder fails', () => {
    const projectRoot = gradleProject();
    const warnings: string[] = [];
    failReportRemoval('ENOTEMPTY', 'ENOTEMPTY: directory not empty, rmdir');

    let caught: unknown;
    try {
      buildFindings(projectRoot, {
        gradle: 'gradle',
        warn: { write: (text) => warnings.push(text) },
        spawn: () => spawnReturn({ status: 1, stderr: DAEMON_DISAPPEARED }),
      });
    } catch (error) {
      caught = error;
    }

    const message = messageOf(caught);
    expect(message).toContain(DAEMON_DISAPPEARED);
    expect(message).toContain('The Gradle daemon or one of its JVMs ran out of memory');
    expect(message).not.toContain('ENOTEMPTY');
    expect(warnings.some((entry) => entry.includes('ENOTEMPTY'))).toBe(true);
  });

  it('returns findings when Gradle succeeds even if removing the temporary report folder fails', () => {
    const projectRoot = gradleProject();
    const warnings: string[] = [];
    failReportRemoval('EACCES', 'EACCES: permission denied, rmdir');

    const report = buildFindings(projectRoot, {
      gradle: 'gradle',
      warn: { write: (text) => warnings.push(text) },
      spawn: (_command, _args, options) => {
        writeEmptyModuleReport(reportDirFrom(options));
        return spawnReturn({ status: 0 });
      },
    });

    expect(report.findings).toEqual([]);
    expect(warnings.some((entry) => entry.includes('EACCES'))).toBe(true);
  });
});
