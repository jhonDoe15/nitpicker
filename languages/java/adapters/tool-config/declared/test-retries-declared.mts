import { childAt } from '../../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../../shared/values/xml.mts';
import { numberOr } from '../../../../../shared/values/readers.mts';
import { missingProjectConfig as untypedMissingProjectConfig } from '../../../../../shared/conventions/tool-precedence.mjs';
import {
  configurations,
  pluginsNamed,
  mavenTextsOf,
} from '../../../builds/narrowing/maven-sources.mts';
import { declarationText, gradleSettings, mavenText } from './declared-build.mts';
import type {
  ChoiceContext,
  DeclaredBuild,
  Declaration,
  Pom,
  ChoiceLayers,
  Script,
  ToolChoice,
  ToolSpec,
} from './declared-types.mts';

const missingProjectConfig: (tool: string, looked: string) => string = untypedMissingProjectConfig;

const MAX_RETRIES = 10;
const GRADLE_SETTING = 'maxRetries';
const GRADLE_CONTEXT = /\b(?:retry|testRetry)\b/u;
const MAVEN_PLUGINS = new Map([
  ['maven-surefire-plugin', 'surefire.rerunFailingTestsCount'],
  ['maven-failsafe-plugin', 'failsafe.rerunFailingTestsCount'],
]);
const LOOKED =
  'test retries in the build (maxRetries of the test-retry plugin or Develocity in a build.gradle(.kts), or rerunFailingTestsCount of maven-surefire-plugin or maven-failsafe-plugin in a pom.xml)';

function countIn(text: string | undefined): number | undefined {
  const literal = /^\s*(\d+)\b/u.exec(text ?? '')?.[1];
  return literal === undefined ? undefined : Number(literal);
}

function gradleDeclarations(scripts: readonly Script[]): Declaration[] {
  return gradleSettings(scripts, { context: GRADLE_CONTEXT, names: [GRADLE_SETTING] }).map(
    (found) => ({
      file: found.file,
      text: found.text.trim(),
      setting: GRADLE_SETTING,
      value: countIn(found.value),
      ...(found.conditional ? ({ conditional: true } as const) : {}),
    }),
  );
}

function mavenDeclaration(pom: Pom, setting: string, text: string): Declaration {
  const element = setting.split('.')[1] ?? '';
  return {
    file: pom.file,
    text: `<${element}>${text}</${element}>`,
    setting,
    value: countIn(text),
  };
}

function pluginDeclarations(
  poms: readonly Pom[],
  pom: Pom & { project: XmlElement },
): Declaration[] {
  return [...MAVEN_PLUGINS].flatMap(([artifact, setting]) =>
    pluginsNamed(pom.project, new Set([artifact]))
      .flatMap((plugin) => configurations(plugin))
      .flatMap((configuration) => mavenTextsOf(configuration, 'rerunFailingTestsCount'))
      .map((text) => mavenDeclaration(pom, setting, mavenText(poms, pom, text))),
  );
}

function propertyDeclarations(pom: Pom & { project: XmlElement }): Declaration[] {
  return [...MAVEN_PLUGINS.values()].flatMap((setting) => {
    const text = childAt(pom.project, 'properties', setting)?.text?.trim();
    return text === undefined ? [] : [mavenDeclaration(pom, setting, text)];
  });
}

function mavenDeclarations(poms: readonly Pom[]): Declaration[] {
  return poms.flatMap(({ project, ...pom }) =>
    project === undefined
      ? []
      : [
          ...pluginDeclarations(poms, { ...pom, project }),
          ...propertyDeclarations({ ...pom, project }),
        ],
  );
}

export function testRetryDeclarations(build: DeclaredBuild): Declaration[] {
  return [...gradleDeclarations(build.scripts), ...mavenDeclarations(build.poms)];
}

function applicable(declaration: Declaration): boolean {
  return declaration.conditional !== true && declaration.value !== undefined;
}

export function testRetryValues(
  declarations: readonly Declaration[],
): Readonly<Record<string, number>> {
  const values: Record<string, number> = {};
  for (const declaration of declarations.filter(applicable)) {
    const count = numberOr(declaration.value, 0);
    if (count > MAX_RETRIES) {
      throw new Error(
        `${declaration.setting} in ${declaration.file} is ${String(declaration.value)}: it must be a whole number from 0 to ${String(MAX_RETRIES)}`,
      );
    }
    values[declaration.setting] = Math.max(values[declaration.setting] ?? 0, count);
  }
  return values;
}

function testsChoice(build: DeclaredBuild, { layers }: ChoiceContext): ToolChoice {
  const declarations = testRetryDeclarations(build);
  if (declarations.length === 0) {
    throw new Error(missingProjectConfig('tests', LOOKED));
  }
  return {
    arguments: layers.nitpickerFirst ? {} : testRetryValues(declarations),
    files: [],
  };
}

function testsNotice(declarations: readonly Declaration[], layers: ChoiceLayers): string[] {
  if (layers.nitpickerFirst) {
    return [];
  }
  const skipped = declarations.filter((declaration) => !applicable(declaration));
  return skipped.length === 0
    ? []
    : [
        `Test retries run as your build declares them; not applied from your build: ${skipped.map((declaration) => `${declarationText(declaration)} (${declaration.file})`).join(', ')}`,
      ];
}

function noticeable(declarations: readonly Declaration[]): Declaration[] {
  return declarations.filter((declaration) => declaration.value !== 0);
}

export const TESTS: ToolSpec = {
  label: 'test retry',
  declarations: testRetryDeclarations,
  noticeable,
  choice: testsChoice,
  notice: testsNotice,
};
