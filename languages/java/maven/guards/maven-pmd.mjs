import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../maven-command.mjs';
import { writePmdRulesets } from '../../builds/rulesets/pmd-rulesets.mjs';
import { EMPTY_SARIF } from '../maven-lint.mjs';
import { guardCompiler } from '../errorprone/maven-compiler.mjs';
import { toolCommand } from '../../builds/tools/tool-commands.mjs';

const CPD_REPORT = 'cpd.xml';
const CPD_FAILURE = 'cpd-failed.txt';
const CPD_SKIPPED = 'cpd-skipped.txt';

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
    compiler: guardCompiler(module.compiler),
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
  const command = toolCommand('pmd', {
    report,
    rulesets: pmdRulesets(context),
    auxClasspath: writeAuxClasspath(context),
    directories: linted,
  });
  runJava({
    tool: 'PMD',
    classpath: tools.pmd,
    mainClass: 'net.sourceforge.pmd.cli.PmdCli',
    args: command.args,
    cwd: module.basedir,
    accept: ({ status }) => command.accepts(status),
  });
}

function launchCpd({ module, tools }, command) {
  try {
    return runJava({
      tool: 'PMD CPD',
      classpath: tools.pmd,
      mainClass: command.launcher,
      args: command.args,
      cwd: module.basedir,
    });
  } catch (error) {
    return { signal: error.code ?? error.name, stderr: error.message };
  }
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
  const command = toolCommand('cpd', { report, directories });
  const result = launchCpd({ module, tools }, command);
  if (!command.accepts(result.status)) {
    rmSync(report, { force: true });
    writeFileSync(failure, `${String(result.status ?? result.signal)}\n${result.stderr}`);
  }
}
