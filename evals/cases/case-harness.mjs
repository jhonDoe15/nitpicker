import { readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { write } from '../lib/consumer.mjs';
import { copiedWorkdir, loadCase, runCase } from '../runner/run-case.mjs';

export const casesDirectory = import.meta.dirname;
export const packageRoot = path.resolve(casesDirectory, '..', '..', 'typescript');
export const strictCleanRoot = path.join(packageRoot, 'preset', 'fixtures', 'strict-clean');
export const referenceAgent = path.join(casesDirectory, '..', 'runner', 'reference-agent.mjs');
// The full gate includes mutation testing and takes minutes per case, so the default run uses the
// static analyzers only. NITPICKER_EVAL_FULL_GATE=1 runs every analyzer, as the strict-clean
// fixture test does.
const QUICK_ANALYZERS = [
  'eslint-lint',
  'eslint-errors',
  'eslint-logging',
  'eslint-module-effects',
  'entry-points',
  'prettier-format',
  'typescript-typecheck',
  'dependency-architecture',
  'coding-standards',
  'coupling',
  'structure',
  'duplicates',
  'dead-code',
];
const FULL_GATE = process.env.NITPICKER_EVAL_FULL_GATE === '1';
export const analyzerArgumentsWithout = (skipped = []) =>
  FULL_GATE
    ? []
    : QUICK_ANALYZERS.filter((name) => !skipped.includes(name)).flatMap((name) => [
        '--analyzer',
        name,
      ]);
export const CASE_TIMEOUT_MS = 600_000;

// The fixture installed as a consumer would have it, except that the dependencies are the ones
// already in typescript/node_modules (no install, no network). The real gate then runs against it.
export function linkedWorkdir() {
  const prepare = copiedWorkdir();
  return ({ caseDefinition, workdir }) => {
    write(workdir, '.gitignore', 'node_modules/\nreports/\n');
    write(
      workdir,
      'package.json',
      readFileSync(path.join(strictCleanRoot, 'package.json'), 'utf8'),
    );
    symlinkSync(path.join(packageRoot, 'node_modules'), path.join(workdir, 'node_modules'));
    prepare({ caseDefinition, workdir });
  };
}

/**
 * Runs a case with the reference agent against the real gate and no model call. `overlay` names a
 * cheating variant (`cases/<id>/cheats/<overlay>/`) that is applied on top of the honest solution.
 * `withoutAnalyzers` drops analyzers from the quick subset: a cheat that turns an analyzer off
 * through `disable` would make an explicit `--analyzer` for it an error, whereas a full-gate run
 * (no `--analyzer` flags) simply skips it.
 */
export function runReference(caseId, { overlay, withoutAnalyzers } = {}) {
  return runCase({
    caseDefinition: loadCase(path.join(casesDirectory, caseId)),
    agentCommand: ['node', referenceAgent, ...(overlay ? ['--overlay', overlay] : [])],
    prepareWorkdir: linkedWorkdir(),
    gateCommand: [
      'node',
      path.join(packageRoot, 'core', 'cli.mjs'),
      '--base',
      'main',
      ...analyzerArgumentsWithout(withoutAnalyzers),
    ],
    tier: 'reference',
    model: overlay ? `cheat-${overlay}` : 'reference-solution',
    nitpickerVersion: '0.0.0',
  });
}
