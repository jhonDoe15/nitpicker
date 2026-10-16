import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../../maven-command.mjs';
import { EMPTY_SARIF, kotlinFiles, relativeTo } from './kotlin-files.mjs';

const KTLINT_FAILURE_CODE = 1;
const KTFMT_ERROR = 'Error formatting';

export function ktlintArguments({ module, report }) {
  return [
    '--relative',
    `--reporter=sarif,output=${report}`,
    ...module.kotlin.sourceRoots.map((root) => `${relativeTo(module.basedir, root)}/**/*.kt`),
  ];
}

export function ktfmtArguments({ module, options, files }) {
  return [
    `--${options.ktfmtStyle}-style`,
    '--dry-run',
    ...(options.editorconfig ? ['--enable-editorconfig'] : []),
    ...files.map((file) => relativeTo(module.basedir, file)),
  ];
}

function runKtlint({ module, reportDir, tools }) {
  const report = path.join(reportDir, 'ktlint.sarif');
  rmSync(report, { force: true });
  runJava({
    tool: 'ktlint',
    classpath: tools.ktlint,
    mainClass: 'com.pinterest.ktlint.Main',
    args: ktlintArguments({ module, report }),
    cwd: module.basedir,
    accept: (result) => result.status <= KTLINT_FAILURE_CODE && existsSync(report),
  });
}

function runKtfmt({ module, reportDir, tools, options, files }) {
  const result = runJava({
    tool: 'ktfmt',
    classpath: tools.ktfmt,
    mainClass: 'com.facebook.ktfmt.cli.Main',
    args: ktfmtArguments({ module, options, files }),
    cwd: module.basedir,
    accept: (outcome) => outcome.status === 0 && !outcome.stderr.includes(KTFMT_ERROR),
  });
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
  const files = kotlinFiles(module.kotlin.sourceRoots);
  if (files.length === 0) {
    return;
  }
  if (options.formatter === 'ktlint') {
    runKtlint({ module, reportDir, tools });
  } else if (options.formatter === 'ktfmt') {
    runKtfmt({ module, reportDir, tools, options, files });
  }
}
