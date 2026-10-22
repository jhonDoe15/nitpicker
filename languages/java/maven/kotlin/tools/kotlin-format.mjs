import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../../maven-command.mjs';
import { withStyleWorkspace } from './kotlin-style-workspace.mjs';
import { EMPTY_SARIF, kotlinFiles, lintedRoots, relativeTo } from './kotlin-files.mjs';

const KTLINT_FAILURE_CODE = 1;
const KTFMT_ERROR = 'Error formatting';

export function ktlintArguments({ module, report, defaultsFile }) {
  return [
    '--relative',
    `--reporter=sarif,output=${report}`,
    ...(defaultsFile === undefined ? [] : [`--editorconfig=${defaultsFile}`]),
    ...lintedRoots(module.kotlin).map((root) => `${relativeTo(module.basedir, root)}/**/*.kt`),
  ];
}

export function ktfmtArguments({ module, options, files }) {
  return [
    `--${options.ktfmtStyle}-style`,
    '--dry-run',
    ...(options.ktfmtMaxWidth === undefined ? [] : [`--max-width=${options.ktfmtMaxWidth}`]),
    ...(options.ktfmtEditorconfig ? ['--enable-editorconfig'] : []),
    ...files.map((file) => relativeTo(module.basedir, file)),
  ];
}

function runKtlint({ module, reportDir, tools, options, files }) {
  const report = path.join(reportDir, 'ktlint.sarif');
  rmSync(report, { force: true });
  withStyleWorkspace({ module, options, files }, ({ cwd, defaultsFile }) =>
    runJava({
      tool: 'ktlint',
      classpath: tools.ktlint,
      mainClass: 'com.pinterest.ktlint.Main',
      args: ktlintArguments({ module, report, defaultsFile }),
      cwd,
      accept: (result) => result.status <= KTLINT_FAILURE_CODE && existsSync(report),
    }),
  );
}

function ktfmtResult({ module, tools, options, files }) {
  function run(cwd) {
    return runJava({
      tool: 'ktfmt',
      classpath: tools.ktfmt,
      mainClass: 'com.facebook.ktfmt.cli.Main',
      args: ktfmtArguments({ module, options, files }),
      cwd,
      accept: (outcome) => outcome.status === 0 && !outcome.stderr.includes(KTFMT_ERROR),
    });
  }
  return options.ktfmtEditorconfig
    ? withStyleWorkspace({ module, options, files }, ({ cwd }) => run(cwd))
    : run(module.basedir);
}

function runKtfmt({ module, reportDir, tools, options, files }) {
  const result = ktfmtResult({ module, tools, options, files });
  const changed = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.kt'));
  writeFileSync(
    path.join(reportDir, 'ktfmt.txt'),
    [...new Set(changed)]
      .sort()
      .map((line) => `${line}\n`)
      .join(''),
  );
}

export function runKotlinFormatter({ module, reportDir, tools, options }) {
  writeFileSync(path.join(reportDir, 'ktlint.sarif'), EMPTY_SARIF);
  writeFileSync(path.join(reportDir, 'ktfmt.txt'), '');
  const files = kotlinFiles(lintedRoots(module.kotlin));
  if (files.length === 0) {
    return;
  }
  if (options.formatter === 'ktlint') {
    runKtlint({ module, reportDir, tools, options, files });
  } else if (options.formatter === 'ktfmt') {
    runKtfmt({ module, reportDir, tools, options, files });
  }
}
