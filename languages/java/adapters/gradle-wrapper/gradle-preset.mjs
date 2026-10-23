import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { gradleTarget } from './gradle-command.mjs';
import { runGradle } from './gradle-process.mjs';
import { withGradleLog } from './diagnostics/failure-log.mjs';
import { condenseFailure } from './diagnostics/failure-text.mjs';
import { gradleBudget } from './gradle-budget.mjs';
import { failingTestsOf } from '../gradle-reports/failing-tests.mjs';
import { toolConfigChoices, toolConfigProperties } from '../tool-config/tool-config-choices.mjs';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { javaStyleProperties } from '../style/java-style.mjs';
import { writeSpringRoles } from '../spring-arch/spring-roles.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_FAILURE_LENGTH = 3500;
const CLOCK_SLACK_MS = 2000;
const CHECKSTYLE_EXPORT = 'checkstyle-nitpicker.xml';
const GRADLE_FLAGS = ['--console=plain', '--quiet', '--no-configuration-cache'];

export function lintBaselineProperties({ snapshot, baselineRoot } = {}) {
  return snapshot === 'head' && baselineRoot !== undefined
    ? [`-Pnitpicker.lintBaseline=${baselineRoot}`]
    : [];
}

function commonArguments({ reportBase, policy, kotlinArguments }) {
  return [
    ...GRADLE_FLAGS,
    `-Pnitpicker.reportDir=${reportBase}`,
    ...lintBaselineProperties(policy),
    ...kotlinArguments,
  ];
}

function assertSucceeded(result, projectRoot, { reportBase, since }) {
  if (result.error === undefined && result.status === 0) {
    return;
  }
  const detail = condenseFailure(
    result.stderr?.trim() ? result.stderr : (result.stdout ?? ''),
    MAX_FAILURE_LENGTH,
  );
  const failure =
    result.error ??
    failingTestsOf(projectRoot, { reportBase, since }) ??
    new Error(`Java preset failed in ${projectRoot}: ${detail || 'no diagnostic output'}`);
  throw withGradleLog(failure, result);
}

function exportArguments(common, { initScript, directory, policy }) {
  mkdirSync(directory, { recursive: true });
  return [
    ...common,
    ...javaStyleProperties(policy),
    `-Pnitpicker.checkstyle.exportConfig=${path.join(directory, CHECKSTYLE_EXPORT)}`,
    '-I',
    initScript,
    'nitpickerCheckstyleConfig',
  ];
}

function gradleOptions(target, { projectRoot, budget, spawn }) {
  return {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: target.shell,
    timeout: budget.commandTimeoutMs,
    spawn,
  };
}

function headFactProperties(policy, directory) {
  mkdirSync(directory, { recursive: true });
  const roles = writeSpringRoles(policy.springRoles, directory);
  return [
    ...javaStyleProperties(policy),
    ...(policy.spring === true ? ['-Pnitpicker.spring=true'] : []),
    ...(roles === undefined ? [] : [`-Pnitpicker.spring.roles=${roles}`]),
  ];
}

export function gradleStages(common, { projectRoot, initScript, policy, directory }) {
  const checkstyleBase = path.join(directory, CHECKSTYLE_EXPORT);
  const layersCheckstyle = toolConfigChoices(projectRoot, policy).checkstyle.project !== undefined;
  return [
    ...(layersCheckstyle ? [() => exportArguments(common, { initScript, directory, policy })] : []),
    () => [
      ...common,
      ...toolConfigProperties(projectRoot, policy, { directory, checkstyleBase }),
      ...headFactProperties(policy, directory),
      '-I',
      initScript,
      'nitpickerJava',
    ],
  ];
}

export function runJavaPreset(
  projectRoot,
  {
    gradle,
    spawn,
    initScript = INIT_SCRIPT,
    policy = {},
    reportBase,
    kotlinRun,
    budget = gradleBudget(),
  } = {},
) {
  const withKotlin = kotlinRun?.withArguments ?? ((run) => run([]));
  const directory = path.join(reportBase, 'tool-config');
  const since = Date.now() - CLOCK_SLACK_MS;
  withKotlin((kotlinArguments) => {
    const common = commonArguments({ reportBase, policy, kotlinArguments });
    for (const stage of gradleStages(common, { projectRoot, initScript, policy, directory })) {
      const target = gradleTarget({ projectRoot, configured: gradle, args: stage() });
      const result = runGradle(
        target.command,
        target.args,
        gradleOptions(target, { projectRoot, budget, spawn }),
      );
      assertSucceeded(result, projectRoot, { reportBase, since });
    }
  });
}
