import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldOf, listOf, parseJson } from '../../../../shared/values/readers.mts';
import { REPORT_VARIABLE } from './console-report.mts';
import testConsoleReporter from './vitest-reporter.config.mts';

const ROOT = '/work/app';
const moduleEntity = { type: 'module', moduleId: `${ROOT}/test/a.test.ts` } as const;
const testEntity = { type: 'test', fullName: 'suite > works', module: moduleEntity } as const;

describe('the vitest console reporter', () => {
  let reportPath: string;

  beforeEach(() => {
    reportPath = path.join(mkdtempSync(path.join(tmpdir(), 'reporter-')), 'out', 'report.json');
    vi.stubEnv(REPORT_VARIABLE, reportPath);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(path.dirname(path.dirname(reportPath)), { recursive: true, force: true });
  });

  function entriesFor(
    logs: readonly { content: string; type?: string; taskId?: string }[],
    {
      config = {},
      entities = {},
    }: {
      config?: { onConsoleLog?: (content: string) => boolean };
      entities?: Record<string, typeof moduleEntity | typeof testEntity>;
    } = {},
  ): readonly unknown[] {
    const reporter = testConsoleReporter();
    reporter.onInit({
      config: { root: ROOT, ...config },
      state: { getReportedEntityById: (id) => (id === undefined ? undefined : entities[id]) },
    });
    for (const log of logs) {
      reporter.onUserConsoleLog({ type: 'stderr', taskId: 't', ...log });
    }
    reporter.onTestRunEnd();
    return listOf(fieldOf(parseJson(readFileSync(reportPath, 'utf8')), 'entries'));
  }

  it('keeps standard error only, and attributes it to the file and test', () => {
    const logs = [
      { content: 'printed with console.log\n', type: 'stdout' },
      { content: 'Warning: leaked timer\n', taskId: 'test' },
      { content: 'Global warning\n', taskId: 'module' },
    ];

    expect(entriesFor(logs, { entities: { test: testEntity, module: moduleEntity } })).toEqual([
      {
        file: `${ROOT}/test/a.test.ts`,
        test: 'suite > works',
        messages: ['Warning: leaked timer'],
      },
      { file: `${ROOT}/test/a.test.ts`, test: '', messages: ['Global warning'] },
    ]);
  });

  it('attributes output from an unknown task to no file', () => {
    expect(entriesFor([{ content: 'Orphan warning\n', taskId: 'gone' }])).toEqual([
      { file: '', test: '', messages: ['Orphan warning'] },
    ]);
  });

  it('skips a log the project filters out with onConsoleLog', () => {
    const onConsoleLog = vi.fn((content: string) => !content.startsWith('Known'));
    const logs = [{ content: 'Known noise\n', taskId: 'test' }, { content: 'New noise\n' }];

    const entries = entriesFor(logs, { config: { onConsoleLog }, entities: { test: testEntity } });

    expect(entries.map((entry) => fieldOf(entry, 'messages'))).toEqual([['New noise']]);
    expect(onConsoleLog).toHaveBeenCalledWith('Known noise\n', 'stderr', testEntity);
  });

  it('writes nothing when the report variable is not set', () => {
    vi.stubEnv(REPORT_VARIABLE, '');
    const reporter = testConsoleReporter();
    reporter.onInit({ config: { root: ROOT }, state: { getReportedEntityById: () => undefined } });
    reporter.onUserConsoleLog({ type: 'stderr', content: 'x\n' });
    reporter.onTestRunEnd();

    expect(existsSync(reportPath)).toBe(false);
  });
});
