import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolveInside } from '../../../../shared/conventions/read-inside.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { JAVA_ASSERTION_HELPERS } from '../../conventions/java-conventions.mjs';
import { PROJECT_TOOL_CONFIGS } from '../gradle-presets.mjs';
import { mergeCheckstyleFiles } from './checkstyle/checkstyle-merge.mts';
import { pmdLayerFiles } from './layer-files.mjs';
import { declaredToolChoices } from './declared/declared-choices.mjs';
import { fieldOf, fieldsOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { type JavaPolicy, callUntyped, optionalText } from '../typed/java-values.mts';

type ToolChoice = {
  readonly project?: string | undefined;
  readonly projectWins?: unknown;
  readonly arguments?: unknown;
  readonly [field: string]: unknown;
};
type ToolChoices = Readonly<Record<string, ToolChoice | undefined>>;
type PropertyFiles = { readonly directory: string; readonly checkstyleBase: string };
type CheckstyleRequest = PropertyFiles & { readonly checkstyle: ToolChoice | undefined };

function projectChoice(
  projectRoot: string,
  policy: JavaPolicy,
  [tool, file]: readonly [string, string],
): ToolChoice {
  const declared = fieldOf(policy['toolPrecedence'], tool);
  const precedence = declared === undefined ? ['nitpicker'] : textsOf(declared);
  const projectConfig = resolveInside(policy.policyRoot ?? projectRoot, file);
  if (
    precedence.includes('project') &&
    (projectConfig === undefined || !existsSync(projectConfig))
  ) {
    throw new Error(textOf(missingProjectConfig(tool, file)));
  }
  const layers: unknown = precedenceLayers(precedence);
  const assertionHelpers = fieldOf(policy.conventions, JAVA_ASSERTION_HELPERS) ?? [];
  return {
    project: fieldOf(layers, 'usesProject') === true ? projectConfig : undefined,
    projectWins: fieldOf(layers, 'nitpickerFirst') !== true,
    ...(tool === 'pmd' ? { assertionHelpers } : {}),
  };
}

function toolChoiceOf(value: unknown): ToolChoice {
  const fields = fieldsOf(value);
  return { ...fields, project: optionalText(fields['project']) };
}

export function toolConfigChoices(projectRoot: string, policy: JavaPolicy = {}): ToolChoices {
  const configs = Object.fromEntries(
    [...PROJECT_TOOL_CONFIGS].map((entry) => [entry[0], projectChoice(projectRoot, policy, entry)]),
  );
  const declared = Object.entries(fieldsOf(callUntyped(declaredToolChoices, projectRoot, policy)));
  return {
    ...configs,
    ...Object.fromEntries(declared.map(([tool, choice]) => [tool, toolChoiceOf(choice)])),
  };
}

function checkstyleProperties({
  checkstyle,
  directory,
  checkstyleBase,
}: CheckstyleRequest): string[] {
  if (checkstyle?.project === undefined) {
    return [];
  }
  const merged = path.join(directory, 'checkstyle-merged.xml');
  mergeCheckstyleFiles({
    nitpicker: checkstyleBase,
    project: checkstyle.project,
    output: merged,
    projectWins: checkstyle.projectWins !== false,
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

function pmdProperty(layers: unknown, layer: string, property: string): string[] {
  const file = fieldOf(layers, layer);
  return file === undefined ? [] : [`-Pnitpicker.pmd.${property}=${textOf(file)}`];
}

export function toolConfigProperties(
  projectRoot: string,
  policy: JavaPolicy = {},
  { directory, checkstyleBase }: PropertyFiles,
): string[] {
  const choices = toolConfigChoices(projectRoot, policy);
  const pmd = callUntyped(pmdLayerFiles, { ...choices['pmd'], directory });
  return [
    ...pmdProperty(pmd, 'nitpicker', 'nitpickerRuleset'),
    ...pmdProperty(pmd, 'project', 'projectConfig'),
    ...pmdProperty(pmd, 'tests', 'testRules'),
    ...pmdProperty(pmd, 'main', 'mainRules'),
    ...checkstyleProperties({ checkstyle: choices['checkstyle'], directory, checkstyleBase }),
    ...settingsProperty(
      'spotbugs',
      choices['spotbugs'],
      path.join(directory, 'spotbugs-settings.json'),
    ),
    ...settingsProperty(
      'errorprone',
      choices['errorprone'],
      path.join(directory, 'errorprone-settings.json'),
    ),
    ...settingsProperty('pit', choices['pit'], path.join(directory, 'pit-settings.json')),
  ];
}
