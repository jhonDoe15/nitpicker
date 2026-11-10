import path from 'node:path';
import { staticChecks } from '../preset/quality-checks.mjs';
import { usesLayeredPrettier } from '../preset/head-policy.mjs';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { fixerError, runFixCommand } from '../../../core/fix/common/fix-command.mjs';
import { formatNotes } from '../../../core/fix/common/fix-notes.mjs';
import { rewriteFormatted } from '../../../core/fix/common/format-rewrite.mjs';

const prettierPolicy = staticChecks.find(({ name }) => name === 'prettier-format');

const RUNNER = path.join(PACKAGE_ROOT, 'core/fix/prettier-base-runner.mjs');

const REPORT_EXCERPT_LENGTH = 200;

function parseResults(stdout, expectedCount) {
  let report;
  try {
    report = JSON.parse(stdout);
  } catch (error) {
    throw new Error('Prettier returned invalid JSON', { cause: error });
  }
  if (!Array.isArray(report?.results) || report.results.length !== expectedCount) {
    throw new Error(
      `Prettier returned an unexpected report: ${stdout.slice(0, REPORT_EXCERPT_LENGTH)}`,
    );
  }
  const failed = report.results.find(({ error }) => error !== undefined);
  if (failed !== undefined) {
    throw new Error(`Prettier could not format ${failed.path}: ${failed.error}`);
  }
  return report.results;
}

function prettierFormatter(settings, operation, filePathOf) {
  const { projectRoot, policyEnvironment, executeFixCommand } = settings;
  return (sources) => {
    const result = runFixCommand({
      operation,
      command: process.execPath,
      args: [
        RUNNER,
        path.join(PACKAGE_ROOT, prettierPolicy.configRelativePath),
        path.join(PACKAGE_ROOT, prettierPolicy.ignoreRelativePath),
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
        results
          .filter(({ formatted }) => typeof formatted === 'string')
          .map(({ path: name, formatted }) => [name, formatted]),
      ),
      unformattable: results.filter(({ unparsable }) => unparsable).map(({ path: name }) => name),
    };
  };
}

export function prettierFixStep(settings, files, mergeBaseSha) {
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
      formatBase: prettierFormatter(settings, 'prettier-base-check', (name) => basePaths.get(name)),
      keepLineEndings: false,
    });
    return { toolErrors: [], notes: formatNotes('prettier', outcome) };
  } catch (error) {
    return { toolErrors: [fixerError('prettier-fix', error)], notes: [] };
  }
}
