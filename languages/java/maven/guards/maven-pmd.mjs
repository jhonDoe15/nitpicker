import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../maven-command.mjs';
import { writePmdRulesets } from '../../builds/rulesets/pmd-rulesets.mjs';
import { EMPTY_SARIF } from '../maven-lint.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';

const CPD_EXITS = new Set([0, 4]);
const CPD_REPORT = 'cpd.xml';
const CPD_FAILURE = 'cpd-failed.txt';
const CPD_SKIPPED = 'cpd-skipped.txt';
const CPD_ROOT = /<pmd-cpd[\s/>]/u;

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

function launchCpd({ module, tools }, report, directories) {
  try {
    return runJava({
      tool: 'PMD CPD',
      classpath: tools.pmd,
      args: [path.join(GRADLE_DIRECTORY, 'CpdReport.java'), report, ...directories],
      cwd: module.basedir,
    });
  } catch (error) {
    return { signal: error.code ?? error.name, stderr: error.message };
  }
}

function wroteReport(result, report) {
  return (
    CPD_EXITS.has(result.status) &&
    existsSync(report) &&
    CPD_ROOT.test(readFileSync(report, 'utf8'))
  );
}

export function runCpd({ module, reportDir, tools }) {
  const report = path.join(reportDir, CPD_REPORT);
  const failure = path.join(reportDir, CPD_FAILURE);
  for (const stale of [report, failure, path.join(reportDir, CPD_SKIPPED)]) {
    rmSync(stale, { force: true });
  }
  const directories = [...module.sourceRoots, ...module.testSourceRoots].filter((root) =>
    existsSync(root),
  );
  if (directories.length === 0) {
    return;
  }
  const result = launchCpd({ module, tools }, report, directories);
  if (!wroteReport(result, report)) {
    rmSync(report, { force: true });
    writeFileSync(failure, `${String(result.status ?? result.signal)}\n${result.stderr}`);
  }
}
