import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../../core/cli.mjs';
import { captureOutput } from '../../../core/diff/reporting/test-support/output-capture.mjs';
import { fixtureGit } from '../../../core/diff/git/test-support/git-repository.mjs';
import {
  commitFiles,
  useQualityDiffRepositories,
} from '../../../core/diff/tests/policy/test-support/quality-diff-harness.mjs';
import { createHistoryAnalyzers } from '../analyzers.mjs';
import {
  amplifiedHistory,
  commitSteps,
  edit,
  SOURCE_FILES,
} from '../../../core/diff/git/test-support/history-repository.mjs';

const { createRepository } = useQualityDiffRepositories();
const PARTNER_NOTICE =
  'Files you changed in src/billing usually change together with src/invoicing (8 of 13 commits), ' +
  'which this change leaves alone. Check that they need no matching edit; ' +
  'if they usually do, see the co-change finding for the knowledge both share.';
const ENTRY = fileURLToPath(new URL('../../../core/cli.mjs', import.meta.url));

function repositoryWithHistory(config) {
  const repository = createRepository({
    ...SOURCE_FILES,
    'nitpicker.config.json': `${JSON.stringify(config)}\n`,
  });
  commitSteps(repository.root, amplifiedHistory());
  fixtureGit(repository.root, ['branch', '-f', repository.baseRef, 'HEAD']);
  return repository;
}

function runGate(repository) {
  const output = captureOutput();
  const exitCode = runCli({
    arguments_: ['--base', repository.baseRef, '--output', 'reports/quality/diff'],
    environment: {},
    currentProjectRoot: repository.root,
    analyzers: createHistoryAnalyzers(ENTRY),
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, output };
}

function quietSummary(repository) {
  return `Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: ${repository.outputRoot}/report.txt\u001b[0m
`;
}

describe('co-change in a base and head run', () => {
  it('keeps the finding unchanged and tells the author which partner the change leaves alone', () => {
    const repository = repositoryWithHistory({ history: { coChange: true } });
    commitFiles(repository.root, edit(['src/billing/invoice.ts'], 900), 'edit billing alone');

    const { exitCode, output } = runGate(repository);
    const report = readFileSync(path.join(repository.outputRoot, 'report.txt'), 'utf8');

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toBe(`Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[1m\u001b[33mNotices (not failing):\u001b[0m
  ${PARTNER_NOTICE}
\u001b[2mFull diagnostics: ${repository.outputRoot}/report.txt\u001b[0m
`);
    expect(report).toMatch(
      /^change-history: base=1 head=1 new=0 resolved=0 unchanged=1 changed-metrics=0 elapsed=[\d.]+s$/mu,
    );
    expect(report).toMatch(/^Tool errors: 0$/mu);
  });

  it('stays quiet when the change touches both modules, or the project has not opted in', () => {
    const optedIn = repositoryWithHistory({ history: { coChange: true } });
    commitFiles(
      optedIn.root,
      edit(['src/billing/invoice.ts', 'src/invoicing/ledger.ts'], 901),
      'edit both',
    );
    const notOptedIn = repositoryWithHistory({});
    commitFiles(notOptedIn.root, edit(['src/billing/invoice.ts'], 902), 'edit billing alone');

    expect(runGate(optedIn).output.stdoutText).toBe(quietSummary(optedIn));
    expect(runGate(notOptedIn).output.stdoutText).toBe(quietSummary(notOptedIn));
  });
});
