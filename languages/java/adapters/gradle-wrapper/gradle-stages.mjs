import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaStyleProperties } from '../style/java-style.mjs';
import { toolConfigChoices, toolConfigProperties } from '../tool-config/tool-config-choices.mjs';
import { writeSpringRoles } from '../spring-arch/spring-roles.mjs';
import { writeSpringRuleset } from '../spring/proxies/proxy-ruleset.mjs';
import { pitHistoryProperties } from '../../builds/pit-history/pit-history.mjs';
import { gradlePitDeadlineMs } from '../../builds/pit-failure/pit-failure.mjs';
import { REPORT_OVERHEAD_MS } from './gradle-budget.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const CHECKSTYLE_EXPORT = 'checkstyle-nitpicker.xml';
const MUTATION_SCOPE_FILE = 'mutation-scope.json';
const CHANGED_FILES_FILE = 'changed-files.json';

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

export function gradleOptions(target, { projectRoot, budget, spawn }) {
  return {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: target.shell,
    timeout: budget.commandTimeoutMs,
    spawn,
  };
}

function headFactProperties(projectRoot, policy, directory) {
  mkdirSync(directory, { recursive: true });
  const roles = writeSpringRoles(policy.springRoles, directory);
  const springRules = writeSpringRuleset(projectRoot, directory);
  return [
    ...javaStyleProperties(policy),
    ...(policy.spring === true ? ['-Pnitpicker.spring=true'] : []),
    ...(policy.featureFolders === true ? ['-Pnitpicker.featureFolders=true'] : []),
    ...(roles === undefined ? [] : [`-Pnitpicker.spring.roles=${roles}`]),
    ...(springRules === undefined ? [] : [`-Pnitpicker.pmd.springRules=${springRules}`]),
  ];
}

function jsonFileProperty(value, { target, property }) {
  if (value === undefined) {
    return [];
  }
  writeFileSync(target, JSON.stringify(value));
  return [`-Pnitpicker.${property}=${target}`];
}

function pitDeadlineProperties(budget) {
  return budget === undefined
    ? []
    : [`-Pnitpicker.pit.deadline=${Math.floor(gradlePitDeadlineMs(budget, REPORT_OVERHEAD_MS))}`];
}

export function gradleStages(
  baseArguments,
  {
    projectRoot,
    initScript,
    policy,
    directory,
    testsFailedModules = [],
    testsSkipped = false,
    budget,
  },
) {
  const common = [
    ...baseArguments,
    ...(policy.quick ? ['-Pnitpicker.quick=true'] : []),
    ...(policy.mutationOff ? ['-Pnitpicker.mutation=off'] : []),
    '--build-cache',
  ];
  const checkstyleBase = path.join(directory, CHECKSTYLE_EXPORT);
  const layersCheckstyle = toolConfigChoices(projectRoot, policy).checkstyle.project !== undefined;
  return [
    ...(layersCheckstyle ? [() => exportArguments(common, { initScript, directory, policy })] : []),
    () => [
      ...common,
      ...(testsFailedModules.length > 0
        ? [`-Pnitpicker.testsFailed=${testsFailedModules.join(',')}`]
        : []),
      ...(testsSkipped ? ['-Pnitpicker.testsSkipped=true'] : []),
      ...toolConfigProperties(projectRoot, policy, { directory, checkstyleBase }),
      ...headFactProperties(projectRoot, policy, directory),
      ...jsonFileProperty(policy.mutationScope, {
        target: path.join(directory, MUTATION_SCOPE_FILE),
        property: 'mutationScope',
      }),
      ...jsonFileProperty(policy.changedFiles, {
        target: path.join(directory, CHANGED_FILES_FILE),
        property: 'changedFiles',
      }),
      ...pitHistoryProperties(policy, projectRoot),
      ...pitDeadlineProperties(budget),
      '-I',
      initScript,
      'nitpickerJava',
    ],
  ];
}
