import { describe, expect, it } from 'vitest';
import { renderReport } from './init-report.mjs';

const NOTE = 'pyproject.toml allows Python 3.8 (">=3.8"), so the CI job runs Python 3.10.';

describe('the init report', () => {
  it('prints the notes of the workflow under the line about it', () => {
    const report = renderReport({
      project: { family: 'python', summary: 'Python, pip, pytest', preset: 'python', notes: [] },
      peers: { missing: [], undeclared: [], installedOnly: [] },
      config: { relative: 'nitpicker.config.json', status: 'unchanged' },
      workflow: { relative: '.github/workflows/nitpicker.yml', status: 'created', notes: [NOTE] },
      workflowFile: '.github/workflows/nitpicker.yml',
      agents: undefined,
      offers: { agents: false, workflow: false },
    });

    expect(report).toBe(
      [
        'nitpicker init: Python, pip, pytest (preset "python")',
        '',
        'Nothing to install: every peer nitpicker needs is already there.',
        '',
        'nitpicker.config.json is already set up',
        '',
        'Install the agent skill:',
        '  npx skills add jhonDoe15/nitpicker --skill nitpicker-python',
        '',
        'created .github/workflows/nitpicker.yml',
        NOTE,
        '',
        'Then run `npx nitpicker` to check a change, or `npx nitpicker --all` to survey the whole project.',
        '',
      ].join('\n'),
    );
  });
});
