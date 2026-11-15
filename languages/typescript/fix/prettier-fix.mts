import path from 'node:path';
import { staticChecks } from '../preset/quality-checks.mjs';
import { usesLayeredPrettier as untypedUsesLayeredPrettier } from '../preset/head-policy.mjs';
import { fileURLToPath } from 'node:url';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { rewriteFormatted as untypedRewriteFormatted } from '../../../core/fix/common/format-rewrite.mjs';
import { checkoutModuleUrl } from '../../../shared/paths/checkout-module.mjs';
import { fieldOf, listOf, textOf } from '../../../shared/values/readers.mts';
import type { FixFile, FixSettings, FixStep } from '../../../core/fix/typed/fix-types.mts';
import { fixerError, formatNotes, runFixCommand } from './typed/fix-views.mts';

const usesLayeredPrettier: (environment: NodeJS.ProcessEnv) => boolean = untypedUsesLayeredPrettier;

type PrettierSettings = Pick<
  FixSettings,
  'projectRoot' | 'repositoryRoot' | 'allFiles' | 'executeFixCommand' | 'writer'
> & { readonly policyEnvironment: NodeJS.ProcessEnv };
type Formatted = {
  readonly formatted: Map<string, string>;
  readonly unformattable: string[];
};
type Formatter = (sources: ReadonlyMap<string, string>) => Formatted;
type PrettierFile = FixFile & { readonly basePath?: string };

const rewriteFormatted: (options: {
  readonly projectRoot: string;
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string | undefined;
  readonly files: readonly FixFile[];
  readonly format: Formatter;
  readonly formatBase: Formatter;
  readonly keepLineEndings: false;
  readonly tool: string;
  readonly allFiles: boolean;
  readonly writer: FixSettings['writer'];
}) => Parameters<typeof formatNotes>[1] = untypedRewriteFormatted;

function prettierCheck(): { readonly config: string; readonly ignore: string } {
  const found = staticChecks.find((check) => check.name === 'prettier-format');
  if (found === undefined) {
    throw new Error('The prettier-format check is not defined');
  }
  return {
    config: found.configRelativePath,
    ignore: textOf(fieldOf(found, 'ignoreRelativePath')),
  };
}

const prettierPolicy = prettierCheck();

const RUNNER = fileURLToPath(
  checkoutModuleUrl(new URL('../../../core/fix/prettier-base-runner.mjs', import.meta.url)),
);

const REPORT_EXCERPT_LENGTH = 200;

function parseResults(stdout: string, expectedCount: number): readonly unknown[] {
  let report: unknown;
  try {
    report = JSON.parse(stdout);
  } catch (error) {
    throw new Error('Prettier returned invalid JSON', { cause: error });
  }
  const results = fieldOf(report, 'results');
  if (!Array.isArray(results) || results.length !== expectedCount) {
    throw new Error(
      `Prettier returned an unexpected report: ${stdout.slice(0, REPORT_EXCERPT_LENGTH)}`,
    );
  }
  const failed = listOf(results).find((result) => fieldOf(result, 'error') !== undefined);
  if (failed !== undefined) {
    throw new Error(
      `Prettier could not format ${textOf(fieldOf(failed, 'path'))}: ${textOf(fieldOf(failed, 'error'))}`,
    );
  }
  return listOf(results);
}

function prettierFormatter(
  settings: PrettierSettings,
  operation: string,
  filePathOf: (name: string) => string,
): Formatter {
  const { projectRoot, policyEnvironment, executeFixCommand } = settings;
  return (sources) => {
    const result = runFixCommand({
      operation,
      command: process.execPath,
      args: [
        RUNNER,
        path.join(PACKAGE_ROOT, prettierPolicy.config),
        path.join(PACKAGE_ROOT, prettierPolicy.ignore),
      ],
      cwd: projectRoot,
      acceptedStatuses: [0],
      environment: policyEnvironment,
      input: JSON.stringify({
        projectRoot,
        layered: usesLayeredPrettier(policyEnvironment),
        files: [...sources].map(([name, source]) => ({
          path: name,
          filePath: path.join(projectRoot, filePathOf(name)),
          source,
        })),
      }),
      executeFixCommand,
    });
    const results = parseResults(result.stdout, sources.size);
    return {
      formatted: new Map(
        results.flatMap((result): [string, string][] => {
          const formatted = fieldOf(result, 'formatted');
          return typeof formatted === 'string'
            ? [[textOf(fieldOf(result, 'path')), formatted]]
            : [];
        }),
      ),
      unformattable: results
        .filter((result) => Boolean(fieldOf(result, 'unparsable')))
        .map((result) => textOf(fieldOf(result, 'path'))),
    };
  };
}

export function prettierFixStep(
  settings: PrettierSettings,
  files: readonly PrettierFile[],
  mergeBaseSha: string | undefined,
): FixStep {
  if (files.length === 0) {
    return { toolErrors: [], notes: [] };
  }
  const basePaths = new Map(files.map(({ path: name, basePath }) => [name, basePath ?? name]));
  try {
    const outcome = rewriteFormatted({
      projectRoot: settings.projectRoot,
      repositoryRoot: settings.repositoryRoot,
      mergeBaseSha,
      files,
      format: prettierFormatter(settings, 'prettier-fix', (name) => name),
      formatBase: prettierFormatter(
        settings,
        'prettier-base-check',
        (name) => basePaths.get(name) ?? name,
      ),
      keepLineEndings: false,
      tool: 'prettier',
      allFiles: settings.allFiles,
      writer: settings.writer,
    });
    return { toolErrors: [], notes: formatNotes('prettier', outcome) };
  } catch (error) {
    return { toolErrors: [fixerError('prettier-fix', error)], notes: [] };
  }
}
