import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { write } from '../lib/consumer.mjs';
import { loadTree } from '../detectors/tree.mjs';
import { copiedWorkdir, loadCase, referenceTree, runCase } from '../runner/run-case.mjs';

export const casesDirectory = import.meta.dirname;
export const packageRoot = path.resolve(casesDirectory, '..', '..');
export const strictCleanRoot = path.join(
  packageRoot,
  'languages',
  'typescript',
  'preset',
  'fixtures',
  'strict-clean',
);
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
// `only` narrows the quick subset further, to the analyzers a cheat's finding comes from; a
// full-gate run ignores it like it ignores the quick subset.
export const analyzerArgumentsWithout = (skipped = [], only = undefined) =>
  FULL_GATE
    ? []
    : QUICK_ANALYZERS.filter(
        (name) => !skipped.includes(name) && (only === undefined || only.includes(name)),
      ).flatMap((name) => ['--analyzer', name]);
export const CASE_TIMEOUT_MS = 600_000;

// The fixture installed as a consumer would have it, except that the dependencies are the ones
// already in node_modules (no install, no network). The real gate then runs against it.
const GITIGNORE = 'node_modules/\nreports/\n';
const consumerPackageJson = () => readFileSync(path.join(strictCleanRoot, 'package.json'), 'utf8');

export function linkedWorkdir() {
  const prepare = copiedWorkdir();
  return ({ caseDefinition, workdir }) => {
    write(workdir, '.gitignore', GITIGNORE);
    write(workdir, 'package.json', consumerPackageJson());
    symlinkSync(path.join(packageRoot, 'node_modules'), path.join(workdir, 'node_modules'));
    prepare({ caseDefinition, workdir });
  };
}

const gateCommand = (withoutAnalyzers, onlyAnalyzers) => [
  'node',
  path.join(packageRoot, 'core', 'cli.mjs'),
  '--base',
  'main',
  ...analyzerArgumentsWithout(withoutAnalyzers, onlyAnalyzers),
];

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
    gateCommand: gateCommand(withoutAnalyzers),
    tier: 'reference',
    model: overlay ? `cheat-${overlay}` : 'reference-solution',
    nitpickerVersion: '0.0.0',
  });
}

const overlayDirectories = (caseDefinition, overlay) => [
  path.join(caseDefinition.directory, 'reference'),
  ...(overlay ? [path.join(caseDefinition.directory, 'cheats', overlay)] : []),
];

/**
 * The trees the runner hands the detectors for a reference-agent run, built in memory: `fixture` is
 * the workdir `linkedWorkdir` prepares (node_modules is a symlink, which `loadTree` skips) and
 * `final` is that tree with the reference solution and then the cheat laid over it, as
 * reference-agent.mjs copies them, and `reference` is the fixture with the reference solution alone.
 */
export function referenceTrees(caseId, { overlay } = {}) {
  const caseDefinition = loadCase(path.join(casesDirectory, caseId));
  const fixture = new Map([
    ...loadTree(caseDefinition.fixtureDirectory),
    ['.gitignore', GITIGNORE],
    ['package.json', consumerPackageJson()],
  ]);
  const final = new Map(fixture);
  for (const directory of overlayDirectories(caseDefinition, overlay)) {
    if (!existsSync(directory)) throw new Error(`${caseId} has no ${directory}`);
    for (const [file, text] of loadTree(directory)) final.set(file, text);
  }
  return { caseDefinition, fixture, final, reference: referenceTree(caseDefinition, fixture) };
}

/**
 * Like `runReference`, but the agent only copies the reference solution and the cheat in and never
 * calls the gate, so the real gate runs once (the runner's final run) instead of twice. The record
 * is the same except for the agent's own gate iterations and report, which `runReference` covers.
 * `analyzers` limits the gate to those quick analyzers (see `flaggedBy` in case-table.mjs).
 */
export function runApplied(caseId, { overlay, withoutAnalyzers, analyzers } = {}) {
  const caseDefinition = loadCase(path.join(casesDirectory, caseId));
  const copies = overlayDirectories(caseDefinition, overlay)
    .map((directory) => `cp -R ${JSON.stringify(`${directory}/.`)} .`)
    .join(' && ');
  return runCase({
    caseDefinition,
    agentCommand: `cat > /dev/null && ${copies}`,
    prepareWorkdir: linkedWorkdir(),
    gateCommand: gateCommand(withoutAnalyzers, analyzers),
    tier: 'reference',
    model: overlay ? `cheat-${overlay}` : 'reference-solution',
    nitpickerVersion: '0.0.0',
  });
}
