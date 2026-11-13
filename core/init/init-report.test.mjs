import { describe, expect, it } from 'vitest';
import { renderReport } from './init-report.mts';

const NOTE = 'pyproject.toml allows Python 3.8 (">=3.8"), so the CI job runs Python 3.10.';

describe('the init report', () => {
  it('prints the notes of the workflow under the line about it', () => {
    const report = renderReport({
      project: { family: 'python', summary: 'Python, pip, pytest', preset: 'python', notes: [] },
      peers: { missing: [], uninstalled: [], undeclared: [], installedOnly: [] },
      config: { relative: 'nitpicker.config.json', status: 'unchanged' },
      workflow: { relative: '.github/workflows/nitpicker.yml', status: 'created', notes: [NOTE] },
      workflowFile: '.github/workflows/nitpicker.yml',
      agents: undefined,
      offers: { agents: false, workflow: false },
      skillSource: './node_modules/nitpicker',
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
        '  npx skills add ./node_modules/nitpicker --skill nitpicker-python',
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

function peerSection(peers) {
  const report = renderReport({
    project: {
      family: 'node',
      summary: 'TypeScript, npm, Vitest',
      preset: 'typescript',
      notes: [],
      packageManager: { run: 'npx nitpicker' },
    },
    peers: { missing: [], uninstalled: [], undeclared: [], installedOnly: [], ...peers },
    config: { relative: 'nitpicker.config.json', status: 'unchanged' },
    offers: { agents: false, workflow: false },
  });
  return report.split('\n\n')[1];
}

describe('the install lines of the init report', () => {
  it.each([
    [
      ['typescript', 'vitest'],
      'typescript and vitest are in package.json but not installed. Install them:',
    ],
    [['typescript'], 'typescript is in package.json but not installed. Install it:'],
  ])('asks for a plain install when package.json declares %j', (uninstalled, heading) => {
    expect(peerSection({ uninstalled, command: 'pnpm install' })).toBe(
      `${heading}\n  pnpm install`,
    );
  });

  it('names the declared peers the install command brings along', () => {
    const peers = {
      missing: ['vitest'],
      uninstalled: ['typescript'],
      command: 'npm install --save-dev vitest',
    };

    expect(peerSection(peers)).toBe(
      [
        'Install what nitpicker needs from your project (missing: vitest; typescript is in package.json but not installed, which this installs too):',
        '  npm install --save-dev vitest',
      ].join('\n'),
    );
  });
});

describe('the install lines for peers that are installed but too old', () => {
  const peers = {
    missing: ['nitpicker@1.0.0', 'typescript@>=5.7 <6.1.0', 'vitest'],
    absent: ['nitpicker@1.0.0'],
    outdated: ['typescript 5.4.5 is older than 5.7', 'vitest 2.1.4 is older than 4.1.11'],
    uninstalled: [],
    command: "yarn add --dev nitpicker@1.0.0 'typescript@>=5.7 <6.1.0' vitest",
  };

  it('says why a peer is asked for again instead of calling it missing', () => {
    expect(peerSection(peers)).toBe(
      [
        'Install what nitpicker needs from your project (missing: nitpicker@1.0.0; typescript 5.4.5 is older than 5.7; vitest 2.1.4 is older than 4.1.11):',
        "  yarn add --dev nitpicker@1.0.0 'typescript@>=5.7 <6.1.0' vitest",
      ].join('\n'),
    );
  });

  it('prints the advice to upgrade a package first below the command', () => {
    const advice = 'No Vitest that nitpicker supports runs with vite 5.4.11. Upgrade vite first.';

    expect(
      peerSection({ ...peers, blockers: [advice] })
        .split('\n')
        .at(-1),
    ).toBe(advice);
  });

  it('prints only the advice when nothing else can be installed', () => {
    const advice = 'Upgrade vite first.';

    expect(peerSection({ blockers: [advice] })).toBe(advice);
  });
});
