import path from 'node:path';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../../shared/paths/checkout-module.mjs';
import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../../diff/git/test-support/fixture-files.mts';
import { serviceMonorepoFiles } from '../../test-support/service-monorepo.mts';
import {
  useMonorepoFixtures,
  violation,
  type MonorepoRun,
} from '../../test-support/monorepo-harness.mts';
import { statusList } from '../../test-support/status-list.mts';

const { repository, run, runAsync } = useMonorepoFixtures();
const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

const WORKER = checkoutModulePath(
  path.join(import.meta.dirname, '../../execution/test-support/project-worker.mjs'),
);

function monorepo() {
  return repository(serviceMonorepoFiles());
}

function comparable(result: MonorepoRun) {
  return {
    exitCode: result.exitCode,
    out: result.out
      .replaceAll(result.reports, '<reports>')
      .replaceAll(/\d+(?:\.\d+)?m?s\b/gu, '<t>'),
    projects: result.json('summary.json').projects,
  };
}

describe('projects run at once', () => {
  it('prints the same blocks, summary and exit code as a run one project at a time', async () => {
    const root = monorepo();
    writeFiles(root, {
      'web/src/a.ts': violation('web-finding'),
      'api/src/b.py': 'B = 2\n',
      'tools/app/src/App.java': 'class App { }\n',
    });

    const sequential = run(root, ['--jobs', '1']);
    const parallel = await runAsync(root, ['--jobs', '3'], { projectWorker: WORKER });

    expect(sequential.exitCode).toBe(1);
    expect(sequential.headings).toEqual([
      '== web (typescript) ==',
      '== api (python) ==',
      '== tools/app (java) ==',
    ]);
    expect(comparable(parallel)).toEqual(comparable(sequential));
  });
  it('reports a project whose worker stopped as an error of that project only', async () => {
    const root = monorepo();
    writeFiles(root, { 'web/src/a.ts': 'export const a = 2;\n', 'api/src/b.py': 'B = 2\n' });

    const result = await runAsync(root, ['--jobs', '2'], {
      projectWorker: path.join(
        import.meta.dirname,
        '../../execution/test-support/missing-worker.mjs',
      ),
    });

    expect(result.exitCode).toBe(2);
    expect(statusList(result)).toEqual(['error', 'error', 'skipped']);
    expect(result.err.split('\n').filter((line) => line.startsWith('nitpicker failed'))).toEqual([
      'nitpicker failed in web: the project run stopped with exit 1 before it finished',
      'nitpicker failed in api: the project run stopped with exit 1 before it finished',
    ]);
  });
  it('refuses a --jobs value that is not a whole number of projects', () => {
    const result = run(monorepo(), ['--jobs', '0']);

    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      'nitpicker failed: --jobs takes a whole number of projects to run at once, 1 or more, not 0\n',
    );
  });
});
