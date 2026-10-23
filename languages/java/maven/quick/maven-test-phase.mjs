import path from 'node:path';
import { runJacocoReport, runPit, collectTestResults } from '../maven-tests.mjs';
import { copyTestResults, requireTestngRun } from '../results/maven-test-results.mjs';
import { runSpringArch } from '../spring/maven-spring-arch.mjs';
import { lifecycleArgs } from '../maven-project.mjs';
import { jacocoPlugin } from '../maven-tools.mjs';

const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';

export function buildGoals({ quick, pinned, modules }) {
  if (quick) {
    return ['test-compile'];
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

export function readTestRuns({ module, reportDir, since, isArchunit, testRuntime, quick }) {
  if (quick) {
    return false;
  }
  const testsRan = collectTestResults({ module, reportDir, since, isArchunit });
  requireTestngRun({ module, since, isArchunit, testRuntime });
  copyTestResults({ module, reportDir, since, isArchunit });
  return testsRan;
}

export function analyzeTests(options) {
  const { module, reportDir, classpaths, tools, pinned, since, spring, springRoles } = options;
  const { isArchunit, testsRan, spawn, quick } = options;
  if (!quick) {
    runJacocoReport({
      module,
      reportDir,
      tools,
      execFiles: jacocoExecFiles(module),
      since,
      testsRan,
      spawn,
    });
    runPit({ module, reportDir, tools, classpaths, isArchunit, spawn });
  }
  runSpringArch({ module, reportDir, tools, classpaths, pinned, spring, springRoles, spawn });
}
