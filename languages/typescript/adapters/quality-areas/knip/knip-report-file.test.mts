import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { scratchTrees } from '../../../../../shared/test-support/scratch-trees.mts';
import { testOptions } from '../../test-runners/typed/test-options.mts';
import { KNIP_REPORT_FILE_VARIABLE } from './knip-reporter.mts';

const knip = vi.hoisted(() => ({ report: undefined as string | undefined, stdout: '' }));

vi.mock('../typed/tooling.mts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../typed/tooling.mts')>()),
  runNodeTool: ({ environment }: { environment: Readonly<Record<string, string>> }) => {
    const file = environment[KNIP_REPORT_FILE_VARIABLE];
    if (knip.report !== undefined && file !== undefined) {
      writeFileSync(file, knip.report);
    }
    return { status: 1, stdout: knip.stdout, stderr: '' };
  },
}));

const { knipReport } = await import('./knip-run.mts');

const tree = scratchTrees('knip-report-file-');

function reported(report: string | undefined, stdout = '') {
  knip.report = report;
  knip.stdout = stdout;
  const project = tree({ 'package.json': '{"name":"app"}' });
  return () => knipReport(testOptions({ projectRoot: project, liveProjectRoot: project }), {});
}

describe('the report knip writes to a file', () => {
  it('reads the report object', () => {
    expect(reported('{"files":["src/a.ts"]}')()).toEqual({ files: ['src/a.ts'] });
  });

  it('says what knip printed when it wrote no report', () => {
    expect(reported(undefined, '  Unknown option --bad\n')).toThrow(
      'knip wrote no report; it printed: Unknown option --bad',
    );
    expect(reported(undefined)).toThrow(/^knip wrote no report$/u);
  });

  it('refuses a report that is not an object', () => {
    expect(reported('null')).toThrow('knip did not report a JSON object');
  });
});
