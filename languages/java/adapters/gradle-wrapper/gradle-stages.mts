import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaStyleProperties } from '../style/java-style.mjs';
import { toolConfigChoices, toolConfigProperties } from '../tool-config/tool-config-choices.mjs';
import { writeSpringRoles } from '../spring-arch/spring-roles.mts';
import { writeSpringRuleset } from '../spring/proxies/proxy-ruleset.mts';
import { effectsProperties } from '../effects/effects-options.mjs';
import { pitHistoryProperties } from '../../builds/pit-history/pit-history.mts';
import { gradlePitDeadlineMs } from '../../builds/pit-failure/pit-failure.mts';
import { REPORT_OVERHEAD_MS as untypedReportOverheadMs } from './gradle-budget.mjs';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
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
  readonly budget?: JavaBudget | undefined;
};
type JsonFileTarget = { readonly target: string; readonly property: string };
type OptionsRequest = {
  readonly projectRoot: string;
  readonly budget: JavaBudget;
  readonly spawn: unknown;
};

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const CHECKSTYLE_EXPORT = 'checkstyle-nitpicker.xml';
const MUTATION_SCOPE_FILE = 'mutation-scope.json';
const CHANGED_FILES_FILE = 'changed-files.json';
const REPORT_OVERHEAD_MS: number = untypedReportOverheadMs;

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
    ...textsOf(callUntyped(effectsProperties, projectRoot)),
    ...(policy['spring'] === true ? ['-Pnitpicker.spring=true'] : []),
    ...(policy['featureFolders'] === true ? ['-Pnitpicker.featureFolders=true'] : []),
    ...(roles === undefined ? [] : [`-Pnitpicker.spring.roles=${textOf(roles)}`]),
    ...(springRules === undefined ? [] : [`-Pnitpicker.pmd.springRules=${textOf(springRules)}`]),
  ];
}

function jsonFileProperty(value: unknown, { target, property }: JsonFileTarget): string[] {
  if (value === undefined) {
    return [];
  }
  writeFileSync(target, JSON.stringify(value));
  return [`-Pnitpicker.${property}=${target}`];
}

function pitDeadlineProperties(budget: JavaBudget | undefined): string[] {
  return budget === undefined
    ? []
    : [
        `-Pnitpicker.pit.deadline=${String(Math.floor(gradlePitDeadlineMs(budget, REPORT_OVERHEAD_MS)))}`,
      ];
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
    budget,
  }: StageRequest,
): (() => string[])[] {
  const common = [
    ...baseArguments,
    ...(policy.quick === true ? ['-Pnitpicker.quick=true'] : []),
    ...(policy['mutationOff'] === true ? ['-Pnitpicker.mutation=off'] : []),
    ...(policy.analyzeGeneratedSources === true ? ['-Pnitpicker.analyzeGenerated=true'] : []),
    '--build-cache',
  ];
  const checkstyleBase = path.join(directory, CHECKSTYLE_EXPORT);
  const choices: unknown = toolConfigChoices(projectRoot, policy);
  const layersCheckstyle = fieldOf(fieldOf(choices, 'checkstyle'), 'project') !== undefined;
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
      ...jsonFileProperty(policy['mutationScope'], {
        target: path.join(directory, MUTATION_SCOPE_FILE),
        property: 'mutationScope',
      }),
      ...jsonFileProperty(policy['changedFiles'], {
        target: path.join(directory, CHANGED_FILES_FILE),
        property: 'changedFiles',
      }),
      ...textsOf(pitHistoryProperties(policy, projectRoot)),
      ...pitDeadlineProperties(budget),
      '-I',
      initScript,
      'nitpickerJava',
    ],
  ];
}
