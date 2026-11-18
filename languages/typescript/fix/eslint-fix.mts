import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { eslintChecks } from '../preset/quality-checks.mjs';
import {
  PROJECT_LAYER_VARIABLE,
  projectLayerValue,
} from '../adapters/lint-engine/project-layer.mjs';
import { layoutTransformFor } from '../preset/tool-configs.mjs';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../shared/paths/checkout-module.mjs';
import type { FixFile, FixSettings, FixStep } from '../../../core/fix/typed/fix-types.mts';
import { linkPolicyFile, resolveTool, type LinkedPolicyFile } from '../adapters/typed/tooling.mts';
import { selectedEslintRules } from './selection/selected-fixes.mts';
import { newPassBudget, TOOL, writeOutputs, type Reported } from './selection/write-planned.mts';
import { reportedFilesOf, type ReportedFile } from './typed/eslint-report.mts';
import {
  containedPath,
  fixerError,
  formatNotes,
  readBytes,
  runFixCommand,
} from '../../../core/fix/typed/fix-views.mts';
import type { Layout } from './typed/fix-views.mts';

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

type EslintSettings = Pick<
  FixSettings,
  'projectRoot' | 'executeFixCommand' | 'selectedRules' | 'writer'
> & {
  readonly policyEnvironment: NodeJS.ProcessEnv;
  readonly eslintSettings: unknown;
  readonly layout: Layout;
};
type Attempt = {
  readonly linked: LinkedPolicyFile | undefined;
  readonly failure?: unknown;
  readonly rewritten: string[];
  readonly fixedFindings: string[];
  readonly changedMeanwhile: string[];
  readonly unformattable: string[];
  readonly unwritable: string[];
  readonly capped: boolean;
};
type Totals = {
  readonly rewritten: Set<string>;
  readonly fixedFindings: Set<string>;
  readonly changedMeanwhile: Set<string>;
  readonly unformattable: Set<string>;
  readonly unwritable: Set<string>;
  capped: boolean;
};
type PassOutcome = Record<Exclude<keyof Totals, 'capped'>, readonly string[]>;

function eslintCheck(name: string) {
  const found = eslintChecks.find((check) => check.name === name);
  if (found === undefined) {
    throw new Error(`The ${name} check is not defined`);
  }
  return found;
}

const eslintPolicy = eslintCheck('eslint-lint');
const loggingPolicy = eslintCheck('eslint-logging');

const MAX_PASSES = 10;

const EXTRA_POLICY_VARIABLE = 'NITPICKER_DIFF_ESLINT_EXTRA_POLICY_CONFIG';

const REPORT_EXCERPT_LENGTH = 200;

function runEslint(settings: EslintSettings, files: readonly FixFile[], linked: LinkedPolicyFile) {
  const { projectRoot, policyEnvironment, executeFixCommand } = settings;
  const { binPath } = resolveTool('eslint', { bin: 'bin/eslint.js' });
  if (binPath === undefined) {
    throw new Error('eslint is not installed');
  }
  return runFixCommand({
    operation: 'eslint-fix',
    command: process.execPath,
    args: [
      binPath,
      '--config',
      checkoutModulePath(
        path.join(PACKAGE_ROOT, 'languages/typescript/adapters/eslint-wrapper.config.mjs'),
      ),
      ...(settings.selectedRules.length === 0 ? ['--fix-dry-run'] : []),
      '--format',
      'json',
      '--no-warn-ignored',
      '--',
      ...files.map(({ path: name }) => `./${name}`),
    ],
    cwd: projectRoot,
    acceptedStatuses: [0, 1],
    environment: {
      ...policyEnvironment,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: checkoutModulePath(
        path.join(PACKAGE_ROOT, eslintPolicy.configRelativePath),
      ),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
      NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: linked.targetPath,
      [EXTRA_POLICY_VARIABLE]: checkoutModulePath(
        path.join(PACKAGE_ROOT, loggingPolicy.configRelativePath),
      ),
      [PROJECT_LAYER_VARIABLE]: projectLayerValue(settings.eslintSettings, {
        liveProjectRoot: projectRoot,
        addsRules: true,
      }),
    },
    input: undefined,
    executeFixCommand,
  });
}

function namesByPath(projectRoot: string, files: readonly FixFile[]): Map<string, string> {
  return new Map(
    files.flatMap(({ path: name }) => {
      const full = containedPath(projectRoot, name);
      return existsSync(full)
        ? [
            [full, name],
            [realpathSync(full), name],
          ]
        : [[full, name]];
    }),
  );
}

function parseReport(stdout: string): readonly unknown[] {
  let results: unknown;
  try {
    results = JSON.parse(stdout);
  } catch (error) {
    throw new Error('ESLint returned invalid JSON', { cause: error });
  }
  if (!Array.isArray(results)) {
    throw new Error(
      `ESLint returned an unexpected report: ${stdout.slice(0, REPORT_EXCERPT_LENGTH)}`,
    );
  }
  return results;
}

function reportedFiles(projectRoot: string, files: readonly FixFile[], stdout: string): Reported[] {
  const names = namesByPath(projectRoot, files);
  return reportedFilesOf(parseReport(stdout)).map(
    ({ filePath, output, messages }: ReportedFile) => {
      const name = names.get(filePath);
      if (name === undefined) {
        throw new Error(`ESLint reported a file it was not given: ${filePath}`);
      }
      return { name, output, messages, fatal: messages.some(({ fatal }) => fatal === true) };
    },
  );
}

function newTotals(): Totals {
  return {
    rewritten: new Set(),
    fixedFindings: new Set(),
    changedMeanwhile: new Set(),
    unformattable: new Set(),
    unwritable: new Set(),
    capped: false,
  };
}

function addPass(totals: Totals, pass: PassOutcome) {
  for (const [key, values] of [
    ['rewritten', pass.rewritten],
    ['fixedFindings', pass.fixedFindings],
    ['changedMeanwhile', pass.changedMeanwhile],
    ['unformattable', pass.unformattable],
    ['unwritable', pass.unwritable],
  ] as const) {
    for (const value of values) {
      totals[key].add(value);
    }
  }
}

function runPasses(
  settings: EslintSettings,
  firstFiles: readonly FixFile[],
  linked: LinkedPolicyFile,
  totals: Totals,
) {
  const { projectRoot } = settings;
  const passes = settings.selectedRules.length === 0 ? 1 : MAX_PASSES;
  const budget = newPassBudget();
  let files = firstFiles;
  for (let pass = 1; pass <= passes && files.length > 0; pass += 1) {
    const before = readBytes(projectRoot, files);
    const reported = reportedFiles(projectRoot, files, runEslint(settings, files, linked).stdout);
    const outcome = writeOutputs(settings, before, reported, budget);
    addPass(totals, {
      ...outcome,
      unformattable: reported.filter(({ fatal }) => fatal).map(({ name }) => name),
    });
    const written = new Set(outcome.rewritten);
    files = files.filter(({ path: name }) => written.has(name));
    totals.capped = passes > 1 && pass === passes && files.length > 0;
  }
}

function attemptEslintFix(settings: EslintSettings, files: readonly FixFile[]): Attempt {
  const { projectRoot, layout } = settings;
  const totals = newTotals();
  let linked: LinkedPolicyFile | undefined;
  let failure: unknown;
  try {
    const [policyFile] = eslintPolicy.policyFiles;
    if (policyFile === undefined) {
      throw new Error('The eslint-lint check names no policy file');
    }
    linked = linkPolicyFile(
      path.join(PACKAGE_ROOT, policyFile),
      path.join(projectRoot, '.nitpicker-fix-tsconfig.json'),
      layoutTransformFor(policyFile, layout),
    );
    runPasses(settings, files, linked, totals);
  } catch (error) {
    failure = error;
  }
  return {
    linked,
    ...(failure === undefined ? {} : { failure }),
    rewritten: [...totals.rewritten],
    fixedFindings: [...totals.fixedFindings],
    changedMeanwhile: [...totals.changedMeanwhile],
    unformattable: [...totals.unformattable],
    unwritable: [...totals.unwritable],
    capped: totals.capped,
  };
}

function removeLinkedFile(linked: LinkedPolicyFile | undefined): unknown {
  try {
    linked?.remove();
    return undefined;
  } catch (error) {
    return error;
  }
}

export function eslintFixStep(settings: EslintSettings, files: readonly FixFile[]): FixStep {
  const unselected =
    settings.selectedRules.length > 0 && selectedEslintRules(settings.selectedRules).length === 0;
  if (files.length === 0 || unselected) {
    return { toolErrors: [], notes: [], fixedFindings: [] };
  }
  const attempt = attemptEslintFix(settings, files);
  const removalFailure = removeLinkedFile(attempt.linked);
  const failure = attempt.failure ?? removalFailure;
  return {
    toolErrors: failure === undefined ? [] : [fixerError('eslint-fix', failure)],
    fixedFindings: attempt.fixedFindings,
    notes: [
      ...formatNotes(TOOL, {
        rewritten: attempt.rewritten,
        changedMeanwhile: attempt.changedMeanwhile,
        unformattable: attempt.unformattable,
        unwritable: attempt.unwritable,
        keptAsIs: [],
      }),
      ...(attempt.capped
        ? [`${TOOL} stopped after ${String(MAX_PASSES)} passes: selected fixes may still apply`]
        : []),
    ],
  };
}
