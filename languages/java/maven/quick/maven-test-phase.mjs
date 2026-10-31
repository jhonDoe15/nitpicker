import path from 'node:path';
import {
  archunitPatterns,
  collectArchunitResults,
  collectTestResults,
  runJacocoReport,
  runPit,
} from '../maven-tests.mjs';
import { copyTestResults, requireTestngRun } from '../results/maven-test-results.mjs';
import { lifecycleArgs } from '../maven-project.mjs';
import { jacocoPlugin } from '../maven-tools.mjs';
import { moduleName } from '../../builds/test-failures.mjs';

const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';

function archunitTestFilter(modules) {
  const patterns = modules.flatMap((module) => archunitPatterns(module.archunitIncludes));
  return [...new Set(patterns.map((pattern) => pattern.replace(/\.class$/u, '')))].join(',');
}

export function buildGoals({ quick, pinned, modules }) {
  if (quick) {
    return [
      'test',
      `-Dtest=${archunitTestFilter(modules)}`,
      '-Dsurefire.failIfNoSpecifiedTests=false',
      '-DfailIfNoSpecifiedTests=false',
      '-DfailIfNoTests=false',
    ];
  }
  return [
    `${jacocoPlugin(pinned)}:prepare-agent`,
    `-Djacoco.destFile=\${project.build.directory}/${OWN_JACOCO_EXEC}`,
    ...lifecycleArgs(modules),
  ];
}

export function jacocoExecFiles(module) {
  return [path.join(module.buildDirectory, OWN_JACOCO_EXEC), ...module.jacocoDestFiles];
}

function moduleNameOf(module, projectRoot) {
  return moduleName(path.relative(projectRoot, module.basedir).replaceAll('\\', '/'));
}

export function readTestRuns(context) {
  const { module, reportDir, since, isArchunit, testRuntime, tolerateFailures } = context;
  if (context.quick) {
    collectArchunitResults({ module, reportDir, since, isArchunit });
    return { testsRan: false, failure: undefined };
  }
  const results = collectTestResults({
    module,
    reportDir,
    since,
    isArchunit,
    tolerateFailures,
    moduleName: moduleNameOf(module, context.projectRoot),
  });
  requireTestngRun({ module, since, isArchunit, testRuntime });
  copyTestResults({ module, reportDir, since, isArchunit });
  return results;
}

export function runCoverageTools(options) {
  const { module, reportDir, tools, classpaths, since, testsRan, isArchunit, spawn } = options;
  if (options.quick) {
    return;
  }
  const execFiles = jacocoExecFiles(module);
  runJacocoReport({ module, reportDir, tools, execFiles, since, testsRan, spawn });
  runPit({ module, reportDir, tools, classpaths, isArchunit, spawn });
}
