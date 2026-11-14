import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaStyleProperties } from '../style/java-style.mjs';
import { toolConfigChoices, toolConfigProperties } from '../tool-config/tool-config-choices.mts';
import { writeSpringRoles } from '../spring-arch/spring-roles.mjs';
import { writeSpringRuleset } from '../spring/proxies/proxy-ruleset.mts';
import { pitHistoryProperties } from '../../builds/pit-history/pit-history.mjs';
import { textOf, textsOf } from '../../../../shared/values/readers.mts';
import { type JavaPolicy, callUntyped } from '../typed/java-values.mts';
import type { JavaBudget } from '../typed/java-run-options.mts';
import type { GradleOptions } from './gradle-process.mts';

type ExportRequest = {
  readonly initScript: string;
  readonly directory: string;
  readonly policy: JavaPolicy;
};
type StageRequest = ExportRequest & {
  readonly projectRoot: string;
  readonly testsFailedModules?: readonly string[];
  readonly testsSkipped: boolean;
};
type OptionsRequest = {
  readonly projectRoot: string;
  readonly budget: JavaBudget;
  readonly spawn: unknown;
};

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const CHECKSTYLE_EXPORT = 'checkstyle-nitpicker.xml';
const MUTATION_SCOPE_FILE = 'mutation-scope.json';

function styleProperties(policy: JavaPolicy): string[] {
  return textsOf(callUntyped(javaStyleProperties, policy));
}

function exportArguments(
  common: readonly string[],
  { initScript, directory, policy }: ExportRequest,
): string[] {
  mkdirSync(directory, { recursive: true });
  return [
    ...common,
    ...styleProperties(policy),
    `-Pnitpicker.checkstyle.exportConfig=${path.join(directory, CHECKSTYLE_EXPORT)}`,
    '-I',
    initScript,
    'nitpickerCheckstyleConfig',
  ];
}

export function gradleOptions(
  shell: unknown,
  { projectRoot, budget, spawn }: OptionsRequest,
): GradleOptions {
  return {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell,
    timeout: budget.commandTimeoutMs,
    spawn,
  };
}

function headFactProperties(projectRoot: string, policy: JavaPolicy, directory: string): string[] {
  mkdirSync(directory, { recursive: true });
  const roles: unknown = writeSpringRoles(policy['springRoles'], directory);
  const springRules: unknown = writeSpringRuleset(projectRoot, directory);
  return [
    ...styleProperties(policy),
    ...(policy['spring'] === true ? ['-Pnitpicker.spring=true'] : []),
    ...(policy['featureFolders'] === true ? ['-Pnitpicker.featureFolders=true'] : []),
    ...(roles === undefined ? [] : [`-Pnitpicker.spring.roles=${textOf(roles)}`]),
    ...(springRules === undefined ? [] : [`-Pnitpicker.pmd.springRules=${textOf(springRules)}`]),
  ];
}

function mutationScopeProperties({ mutationScope }: JavaPolicy, directory: string): string[] {
  if (mutationScope === undefined) {
    return [];
  }
  const file = path.join(directory, MUTATION_SCOPE_FILE);
  writeFileSync(file, JSON.stringify(mutationScope));
  return [`-Pnitpicker.mutationScope=${file}`];
}

export function gradleStages(
  baseArguments: readonly string[],
  {
    projectRoot,
    initScript,
    policy,
    directory,
    testsFailedModules = [],
    testsSkipped,
  }: StageRequest,
): (() => string[])[] {
  const common = [
    ...baseArguments,
    ...(policy.quick === true ? ['-Pnitpicker.quick=true', '--build-cache'] : []),
  ];
  const checkstyleBase = path.join(directory, CHECKSTYLE_EXPORT);
  const choices = toolConfigChoices(projectRoot, policy);
  const layersCheckstyle = choices['checkstyle']?.project !== undefined;
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
      ...mutationScopeProperties(policy, directory),
      ...textsOf(pitHistoryProperties(policy, projectRoot)),
      '-I',
      initScript,
      'nitpickerJava',
    ],
  ];
}
