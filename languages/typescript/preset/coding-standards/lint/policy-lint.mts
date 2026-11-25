import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { checkoutModulePath } from '../../../../../shared/paths/checkout-module.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { fieldOf, listOf, objectOf } from '../../../../../shared/values/readers.mts';
import { UnmappedDiagnosticError } from '../../../adapters/oxlint/oxlint-diagnostics.mts';
import { lintWithOxlint } from '../../../adapters/oxlint/oxlint-runner.mts';
import { withListedFiles } from '../../../adapters/oxlint/plan/listed-files.mts';
import type { LintMessage, LintResult } from '../../../adapters/oxlint/plan/oxlint-shapes.mts';
import { readHeadPolicy } from '../../../adapters/typed/head-policy.mts';
import { lintWithEngine } from './engine-lint.mts';
import { linterConfigs } from '../../eslint-config/typed/config-types.mts';

export type { LintMessage, LintResult };

type PolicyLint = {
  readonly root: string;
  readonly policyRoot: string;
  readonly files: readonly string[];
  readonly environment: Environment;
  readonly nativeFrom?: number;
};

const POLICY_CONFIG =
  'languages/typescript/preset/eslint-config/policies/coding-standards.config.mjs';

const MIN_NATIVE_FILES = 1500;

const sourcePath: (file: string) => string = checkoutModulePath;

function policyConfigPath(policyRoot: string): string {
  return sourcePath(path.join(policyRoot, POLICY_CONFIG));
}

async function policyConfig(policyRoot: string): Promise<Linter.Config[]> {
  const loaded: unknown = await import(pathToFileURL(policyConfigPath(policyRoot)).href);
  return linterConfigs(
    listOf(fieldOf(loaded, 'default')).flatMap((entry) => objectOf(entry) ?? []),
  );
}

function plainMessage(message: Linter.LintMessage): LintMessage {
  return {
    ruleId: message.ruleId ?? undefined,
    message: message.message,
    severity: message.severity,
    line: message.line,
    column: message.column,
    ...(message.fatal === true ? { fatal: true } : {}),
    ...(message.endLine === undefined ? {} : { endLine: message.endLine }),
    ...(message.endColumn === undefined ? {} : { endColumn: message.endColumn }),
  };
}

async function policyEslint({ root, policyRoot }: PolicyLint): Promise<ESLint> {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: await policyConfig(policyRoot),
    allowInlineConfig: false,
  });
}

async function lintWithEslint(request: PolicyLint): Promise<LintResult[]> {
  const { files } = request;
  const eslint = await policyEslint(request);
  const results = await eslint.lintFiles([...files]);
  return results.map((result) => ({
    filePath: result.filePath,
    messages: result.messages.map(plainMessage),
  }));
}

function noTypedRules(): never {
  throw new Error('The coding-standards rules read no types, so none of them needs ESLint.');
}

function relativeTo(root: string, file: string): string {
  return (path.isAbsolute(file) ? path.relative(root, file) : file).replaceAll('\\', '/');
}

function lintNatively({ root, policyRoot, files, environment }: PolicyLint): Promise<LintResult[]> {
  return withListedFiles(
    files.map((file) => relativeTo(root, file)),
    (listed) =>
      lintWithOxlint({
        options: {
          projectRoot: root,
          liveProjectRoot: root,
          configRelativePath: POLICY_CONFIG,
          patterns: [],
          timeoutMs: undefined,
          environment: {},
        },
        projectConfigPath: undefined,
        environment: {
          ...environment,
          ...listed,
          NITPICKER_DIFF_ESLINT_POLICY_CONFIG: policyConfigPath(policyRoot),
          NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
          NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: '',
          NITPICKER_DIFF_ESLINT_PROJECT_LAYER: '',
          NITPICKER_DIFF_ESLINT_EXTRA_POLICY_CONFIG: '',
          NITPICKER_DIFF_ESLINT_ONLY_RULES: '',
        },
        runEslintCli: noTypedRules,
      }),
  );
}

async function nativeResults(request: PolicyLint): Promise<LintResult[] | undefined> {
  try {
    return await lintNatively(request);
  } catch (error) {
    if (error instanceof UnmappedDiagnosticError) {
      return undefined;
    }
    throw error;
  }
}

function isUnparsed(result: LintResult): boolean {
  return result.messages.some((message) => message.fatal === true);
}

function ruleMessages(result: LintResult): LintResult {
  return {
    filePath: result.filePath,
    messages: result.messages.filter((message) => message.ruleId !== undefined),
  };
}

function byFile(left: LintResult, right: LintResult): number {
  return left.filePath.localeCompare(right.filePath);
}

async function engineResults(request: PolicyLint): Promise<LintResult[] | undefined> {
  const { root, files, environment } = request;
  const linted = await lintWithEngine({
    eslint: await policyEslint(request),
    root,
    files,
    environment,
  });
  if (linted === undefined) {
    return undefined;
  }
  const reparsed =
    linted.unparsed.length === 0
      ? []
      : await lintWithEslint({ ...request, files: linted.unparsed });
  return [...linted.results, ...reparsed].sort(byFile);
}

async function oxlintResults(request: PolicyLint): Promise<LintResult[]> {
  const { files, nativeFrom = MIN_NATIVE_FILES } = request;
  if (files.length < nativeFrom) {
    return lintWithEslint(request);
  }
  const linted = await nativeResults(request);
  if (linted === undefined) {
    return lintWithEslint(request);
  }
  const unparsed = linted.filter(isUnparsed).map((result) => result.filePath);
  const reparsed =
    unparsed.length === 0 ? [] : await lintWithEslint({ ...request, files: unparsed });
  return [...linted.filter((result) => !isUnparsed(result)).map(ruleMessages), ...reparsed].sort(
    byFile,
  );
}

export async function lintPolicy(request: PolicyLint): Promise<LintResult[]> {
  if (request.files.length === 0) {
    return [];
  }
  if (readHeadPolicy().tools.eslint?.engine === 'eslint') {
    return lintWithEslint(request);
  }
  return (await engineResults(request)) ?? oxlintResults(request);
}
