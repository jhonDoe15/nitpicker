import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../maven-command.mjs';
import { writePmdRulesets } from '../../builds/rulesets/pmd-rulesets.mjs';
import { EMPTY_SARIF } from '../maven-lint.mjs';

const CPD_FINDINGS_EXIT = 4;

function writeAuxClasspath({ module, reportDir, classpaths }) {
  const entries = new Set([
    ...classpaths.mainCompile,
    ...classpaths.testCompile,
    module.outputDirectory,
    module.testOutputDirectory,
  ]);
  const target = path.join(reportDir, 'pmd-aux-classpath.txt');
  writeFileSync(target, [...entries].filter((entry) => existsSync(entry)).join('\n'));
  return target;
}

function pmdRulesets({ module, reportDir, configs, spring }) {
  return writePmdRulesets({
    reportDir,
    mainDirectories: module.sourceRoots,
    testDirectories: module.testSourceRoots,
    compiler: module.compiler,
    spring,
    nitpicker: configs.pmd.nitpicker,
    project: configs.pmd.project,
  });
}

export function runPmd(context) {
  const { module, reportDir, tools } = context;
  const report = path.join(reportDir, 'pmd.sarif');
  const linted = [...module.sourceRoots, ...module.testSourceRoots].filter((root) =>
    existsSync(root),
  );
  if (linted.length === 0) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const auxClasspath = writeAuxClasspath(context);
  runJava({
    tool: 'PMD',
    classpath: tools.pmd,
    mainClass: 'net.sourceforge.pmd.cli.PmdCli',
    args: [
      'check',
      '--no-cache',
      '--no-progress',
      '--format',
      'sarif',
      '--report-file',
      report,
      '--rulesets',
      pmdRulesets(context).join(','),
      '--aux-classpath',
      `file:${auxClasspath}`,
      '--suppress-marker',
      'NITPICKER-NO-INLINE-SUPPRESSION',
      '--dir',
      linted.join(','),
    ],
    cwd: module.basedir,
    accept: () => existsSync(report),
  });
}

export function runCpd({ module, reportDir, tools }) {
  const directories = [...module.sourceRoots, ...module.testSourceRoots].filter((root) =>
    existsSync(root),
  );
  if (directories.length === 0) {
    return;
  }
  const result = runJava({
    tool: 'PMD CPD',
    classpath: tools.pmd,
    mainClass: 'net.sourceforge.pmd.cli.PmdCli',
    args: [
      'cpd',
      '--minimum-tokens',
      '100',
      '--ignore-identifiers',
      '--ignore-literals',
      '--language',
      'java',
      '--format',
      'xml',
      '--no-fail-on-error',
      ...directories.flatMap((directory) => ['--dir', directory]),
    ],
    cwd: module.basedir,
    accept: ({ status }) => status === 0 || status === CPD_FINDINGS_EXIT,
  });
  writeFileSync(path.join(reportDir, 'cpd.xml'), result.stdout);
}
