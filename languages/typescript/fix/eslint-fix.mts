import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { eslintChecks } from '../preset/quality-checks.mjs';
import {
  PROJECT_LAYER_VARIABLE,
  projectLayerValue,
} from '../adapters/lint-engine/project-layer.mjs';
import { layoutTransformFor } from '../preset/tool-configs.mjs';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { checkoutModulePath } from '../../../shared/paths/checkout-module.mjs';
import type { FixFile, FixSettings, FixStep } from '../../../core/fix/typed/fix-types.mts';
import { linkPolicyFile, resolveTool, type LinkedPolicyFile } from '../adapters/typed/tooling.mts';
import { selectedEslintRules, selectedOutput } from './selection/selected-fixes.mts';
import { applySuggestions } from './suggestions/apply-suggestions.mts';
import type { LintMessage } from './suggestions/typed/suggestion-views.mts';
import { reportedFilesOf, type ReportedFile } from './typed/eslint-report.mts';
import {
  containedPath,
  fixerError,
  formatNotes,
  readBytes,
  runFixCommand,
  withFixedLineEndingsOf,
  writeTexts,
  type Bytes,
  type Layout,
} from './typed/fix-views.mts';

type EslintSettings = Pick<
  FixSettings,
  'projectRoot' | 'executeFixCommand' | 'selectedRules' | 'writer'
> & {
  readonly policyEnvironment: NodeJS.ProcessEnv;
  readonly eslintSettings: unknown;
  readonly layout: Layout;
};
type Reported = {
  readonly name: string;
  readonly output: unknown;
  readonly messages: readonly LintMessage[];
  readonly fatal: boolean;
};
type Attempt = {
  readonly linked: LinkedPolicyFile | undefined;
  readonly failure?: unknown;
  readonly rewritten: string[];
  readonly fixedFindings: string[];
  readonly changedMeanwhile: string[];
  readonly unformattable: string[];
  readonly unwritable: string[];
};

function eslintCheck(name: string) {
  const found = eslintChecks.find((check) => check.name === name);
  if (found === undefined) {
    throw new Error(`The ${name} check is not defined`);
  }
  return found;
}

const eslintPolicy = eslintCheck('eslint-lint');
const loggingPolicy = eslintCheck('eslint-logging');

const TOOL = 'eslint --fix';

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
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(PACKAGE_ROOT, eslintPolicy.configRelativePath),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
      NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: linked.targetPath,
      [EXTRA_POLICY_VARIABLE]: path.join(PACKAGE_ROOT, loggingPolicy.configRelativePath),
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

function fixedText(
  settings: EslintSettings,
  original: string,
  { output, messages, fatal }: Reported,
) {
  if (fatal) {
    return { text: typeof output === 'string' ? output : original, applied: [] };
  }
  if (settings.selectedRules.length === 0) {
    const base = typeof output === 'string' ? output : original;
    return applySuggestions({ text: base, messages, selectedRules: [] });
  }
  const { text, suggested } = selectedOutput(
    original,
    messages,
    selectedEslintRules(settings.selectedRules),
  );
  return { text: text ?? original, applied: suggested };
}

function plannedTexts(settings: EslintSettings, before: Bytes, reported: readonly Reported[]) {
  const findings: string[] = [];
  const planned = reported.flatMap((file) => {
    const original = before.get(file.name)?.toString('utf8') ?? '';
    const { text: fixed, applied } = fixedText(settings, original, file);
    findings.push(
      ...applied.map(
        ({ rule, line }) => `${file.name}:${String(line)} ${rule} (eslint-suggestion)`,
      ),
    );
    const text = withFixedLineEndingsOf(original, fixed);
    return text === original ? [] : [{ name: file.name, text }];
  });
  return { planned, findings };
}

function writeOutputs(settings: EslintSettings, before: Bytes, reported: readonly Reported[]) {
  const { planned, findings } = plannedTexts(settings, before, reported);
  const { written, changedMeanwhile, unwritable } = writeTexts(
    settings.writer,
    planned.map(({ name, text }) => ({ name, bytes: before.get(name), text })),
    TOOL,
  );
  const kept = new Set(written);
  return {
    rewritten: written,
    changedMeanwhile,
    unwritable,
    fixedFindings: findings.filter((finding) => kept.has(finding.slice(0, finding.indexOf(':')))),
  };
}

function attemptEslintFix(
  settings: EslintSettings,
  files: readonly FixFile[],
  before: Bytes,
): Attempt {
  const { projectRoot, layout } = settings;
  let linked: LinkedPolicyFile | undefined;
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
    const reported = reportedFiles(projectRoot, files, runEslint(settings, files, linked).stdout);
    return {
      linked,
      unformattable: reported.filter(({ fatal }) => fatal).map(({ name }) => name),
      ...writeOutputs(settings, before, reported),
    };
  } catch (error) {
    return {
      linked,
      failure: error,
      rewritten: [],
      fixedFindings: [],
      changedMeanwhile: [],
      unformattable: [],
      unwritable: [],
    };
  }
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
  const attempt = attemptEslintFix(settings, files, readBytes(settings.projectRoot, files));
  const removalFailure = removeLinkedFile(attempt.linked);
  const failure = attempt.failure ?? removalFailure;
  return {
    toolErrors: failure === undefined ? [] : [fixerError('eslint-fix', failure)],
    fixedFindings: attempt.fixedFindings,
    notes: formatNotes(TOOL, {
      rewritten: attempt.rewritten,
      changedMeanwhile: attempt.changedMeanwhile,
      unformattable: attempt.unformattable,
      unwritable: attempt.unwritable,
      keptAsIs: [],
    }),
  };
}
