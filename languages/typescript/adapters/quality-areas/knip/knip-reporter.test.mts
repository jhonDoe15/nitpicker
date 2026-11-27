import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scratchTrees } from '../../../../../shared/test-support/scratch-trees.mts';
import reportToFile, {
  KNIP_JSON_REPORTER_VARIABLE,
  KNIP_REPORT_FILE_VARIABLE,
} from './knip-reporter.mts';

const tree = scratchTrees('knip-reporter-');

const REPORTERS = {
  'chunks.mjs': [
    'export default (options) => {',
    '  process.stdout.write(new TextEncoder().encode(\'{"files":\'));',
    '  process.stdout.write(JSON.stringify(options.files));',
    "  process.stdout.write('}');",
    '};',
  ].join('\n'),
  'unnamed.mjs': 'export const reporter = () => {};\n',
  'not-a-function.mjs': 'export default 42;\n',
};

function reporting(reporter: string): string {
  const folder = tree(REPORTERS);
  const report = path.join(folder, 'report.json');
  vi.stubEnv(KNIP_JSON_REPORTER_VARIABLE, path.join(folder, reporter));
  vi.stubEnv(KNIP_REPORT_FILE_VARIABLE, report);
  return report;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the knip reporter that writes the JSON report to a file', () => {
  it('writes what the JSON reporter printed, in text and in bytes', async () => {
    const report = reporting('chunks.mjs');
    await reportToFile({ files: ['src/unused.ts'] });

    expect(JSON.parse(readFileSync(report, 'utf8'))).toEqual({ files: ['src/unused.ts'] });
  });

  it('refuses a JSON reporter module without a default reporter function', async () => {
    reporting('unnamed.mjs');
    await expect(reportToFile({})).rejects.toThrow('knip has no JSON reporter');
    reporting('not-a-function.mjs');
    await expect(reportToFile({})).rejects.toThrow('knip has no JSON reporter');
  });

  it('needs both variables', async () => {
    reporting('chunks.mjs');
    vi.stubEnv(KNIP_REPORT_FILE_VARIABLE, '');
    await expect(reportToFile({})).rejects.toThrow(`needs ${KNIP_REPORT_FILE_VARIABLE}`);
    vi.stubEnv(KNIP_JSON_REPORTER_VARIABLE, undefined);
    await expect(reportToFile({})).rejects.toThrow(`needs ${KNIP_JSON_REPORTER_VARIABLE}`);
  });
});
