import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolveInside as untypedResolveInside } from '../../../../shared/conventions/read-inside.mjs';
import {
  missingProjectConfig as untypedMissingProjectConfig,
  precedenceLayers as untypedPrecedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { fieldOf, fieldsOf, textsOf } from '../../../../shared/values/readers.mts';
import type { JavaPolicy } from '../typed/java-values.mts';
import type { PrecedenceLayers, ToolChoice } from './declared/declared-types.mts';
import type { ProjectChoice, PropertyDirectories } from './pmd-types.mts';
import { JAVA_ASSERTION_HELPERS } from '../../conventions/java-conventions.mts';
import { PROJECT_TOOL_CONFIGS } from '../gradle-presets.mts';
import { mergeCheckstyleFiles } from './checkstyle/checkstyle-merge.mts';
import { pmdLayerFiles } from './layer-files.mts';
import { declaredToolChoices } from './declared/declared-choices.mts';

function projectChoiceOf(
  choice: ProjectChoice | ToolChoice | undefined,
): ProjectChoice | undefined {
  return choice !== undefined && 'projectWins' in choice ? choice : undefined;
}

function toolChoiceOf(choice: ProjectChoice | ToolChoice | undefined): ToolChoice | undefined {
  return choice !== undefined && 'arguments' in choice ? choice : undefined;
}

const resolveInside: (root: string, file: string) => string | undefined = untypedResolveInside;
const missingProjectConfig: (tool: string, looked: string) => string = untypedMissingProjectConfig;
const precedenceLayers: (precedence?: string[]) => PrecedenceLayers = untypedPrecedenceLayers;

export type ToolChoices = Readonly<Record<string, ProjectChoice | ToolChoice>>;

function precedencesOf(policy: JavaPolicy): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(fieldsOf(policy['toolPrecedence'])).map(([tool, found]) => [
      tool,
      textsOf(found),
    ]),
  );
}

export function toolConfigChoices(projectRoot: string, policy: JavaPolicy = {}): ToolChoices {
  const toolPrecedence = precedencesOf(policy);
  const { policyRoot } = policy;
  const assertionHelpers = textsOf(fieldOf(fieldOf(policy, 'conventions'), JAVA_ASSERTION_HELPERS));
  const configs = Object.fromEntries(
    [...PROJECT_TOOL_CONFIGS].map(([tool, file]): [string, ProjectChoice] => {
      const precedence = toolPrecedence[tool] ?? ['nitpicker'];
      const projectConfig = resolveInside(policyRoot ?? projectRoot, file);
      if (
        precedence.includes('project') &&
        (projectConfig === undefined || !existsSync(projectConfig))
      ) {
        throw new Error(missingProjectConfig(tool, file));
      }
      const layers = precedenceLayers(precedence);
      return [
        tool,
        {
          project: layers.usesProject ? projectConfig : undefined,
          projectWins: !layers.nitpickerFirst,
          ...(tool === 'pmd' ? { assertionHelpers } : {}),
        },
      ];
    }),
  );
  return {
    ...configs,
    ...declaredToolChoices(projectRoot, { toolPrecedence, policyRoot }),
  };
}

function checkstyleProperties({
  checkstyle,
  directory,
  checkstyleBase,
}: PropertyDirectories & { checkstyle: ProjectChoice | undefined }): string[] {
  if (checkstyle === undefined) {
    return [];
  }
  if (checkstyle.project === undefined) {
    return [];
  }
  const merged = path.join(directory, 'checkstyle-merged.xml');
  mergeCheckstyleFiles({
    nitpicker: checkstyleBase,
    project: checkstyle.project,
    output: merged,
    projectWins: checkstyle.projectWins,
  });
  return [
    `-Pnitpicker.checkstyle.projectConfig=${checkstyle.project}`,
    `-Pnitpicker.checkstyle.mergedConfig=${merged}`,
  ];
}

function settingsProperty(tool: string, choice: ToolChoice | undefined, file: string): string[] {
  if (choice === undefined) {
    return [];
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(choice.arguments));
  return [`-Pnitpicker.${tool}.settings=${file}`];
}

export function toolConfigProperties(
  projectRoot: string,
  policy: JavaPolicy | undefined,
  { directory, checkstyleBase }: PropertyDirectories,
): string[] {
  const choices = toolConfigChoices(projectRoot, policy);
  const pmdChoice = projectChoiceOf(choices['pmd']);
  const pmd = pmdLayerFiles({
    ...pmdChoice,
    projectWins: pmdChoice?.projectWins ?? true,
    directory,
  });
  return [
    ...(pmd.nitpicker === undefined ? [] : [`-Pnitpicker.pmd.nitpickerRuleset=${pmd.nitpicker}`]),
    ...(pmd.project === undefined ? [] : [`-Pnitpicker.pmd.projectConfig=${pmd.project}`]),
    ...(pmd.tests === undefined ? [] : [`-Pnitpicker.pmd.testRules=${pmd.tests}`]),
    ...(pmd.main === undefined ? [] : [`-Pnitpicker.pmd.mainRules=${pmd.main}`]),
    ...checkstyleProperties({
      checkstyle: projectChoiceOf(choices['checkstyle']),
      directory,
      checkstyleBase,
    }),
    ...settingsProperty(
      'spotbugs',
      toolChoiceOf(choices['spotbugs']),
      path.join(directory, 'spotbugs-settings.json'),
    ),
    ...settingsProperty(
      'errorprone',
      toolChoiceOf(choices['errorprone']),
      path.join(directory, 'errorprone-settings.json'),
    ),
    ...settingsProperty(
      'pit',
      toolChoiceOf(choices['pit']),
      path.join(directory, 'pit-settings.json'),
    ),
    ...settingsProperty(
      'tests',
      toolChoiceOf(choices['tests']),
      path.join(directory, 'tests-settings.json'),
    ),
  ];
}
