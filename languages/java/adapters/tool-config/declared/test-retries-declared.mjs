import { childAt } from '../../../../../shared/ingest/common.mjs';
import { missingProjectConfig } from '../../../../../shared/conventions/tool-precedence.mjs';
import { configurations, pluginsNamed, textsOf } from '../../../builds/narrowing/maven-sources.mjs';
import { declarationText, gradleSettings, mavenText } from './declared-build.mjs';

const MAX_RETRIES = 10;
const GRADLE_SETTING = 'maxRetries';
const GRADLE_CONTEXT = /\b(?:retry|testRetry)\b/u;
const MAVEN_PLUGINS = new Map([
  ['maven-surefire-plugin', 'surefire.rerunFailingTestsCount'],
  ['maven-failsafe-plugin', 'failsafe.rerunFailingTestsCount'],
]);
const LOOKED =
  'test retries in the build (maxRetries of the test-retry plugin or Develocity in a build.gradle(.kts), or rerunFailingTestsCount of maven-surefire-plugin or maven-failsafe-plugin in a pom.xml)';

function countIn(text) {
  const literal = /^\s*(\d+)\b/u.exec(text ?? '')?.[1];
  return literal === undefined ? undefined : Number(literal);
}

function gradleDeclarations(scripts) {
  return gradleSettings(scripts, { context: GRADLE_CONTEXT, names: [GRADLE_SETTING] }).map(
    (found) => ({
      file: found.file,
      text: found.text.trim(),
      setting: GRADLE_SETTING,
      value: countIn(found.value),
      conditional: found.conditional,
    }),
  );
}

function mavenDeclaration(pom, setting, text) {
  return {
    file: pom.file,
    text: `<${setting.split('.')[1]}>${text}</${setting.split('.')[1]}>`,
    setting,
    value: countIn(text),
  };
}

function pluginDeclarations(poms, pom) {
  return [...MAVEN_PLUGINS].flatMap(([artifact, setting]) =>
    pluginsNamed(pom.project, new Set([artifact]))
      .flatMap((plugin) => configurations(plugin))
      .flatMap((configuration) => textsOf(configuration, 'rerunFailingTestsCount'))
      .map((text) => mavenDeclaration(pom, setting, mavenText(poms, pom, text))),
  );
}

function propertyDeclarations(pom) {
  return [...MAVEN_PLUGINS.values()].flatMap((setting) => {
    const text = childAt(pom.project, 'properties', setting)?.text?.trim();
    return text === undefined ? [] : [mavenDeclaration(pom, setting, text)];
  });
}

function mavenDeclarations(poms) {
  return poms
    .filter((pom) => pom.project !== undefined)
    .flatMap((pom) => [...pluginDeclarations(poms, pom), ...propertyDeclarations(pom)]);
}

export function testRetryDeclarations(build) {
  return [...gradleDeclarations(build.scripts), ...mavenDeclarations(build.poms)];
}

function applicable(declaration) {
  return declaration.conditional !== true && declaration.value !== undefined;
}

export function testRetryValues(declarations) {
  const values = {};
  for (const declaration of declarations.filter(applicable)) {
    if (declaration.value > MAX_RETRIES) {
      throw new Error(
        `${declaration.setting} in ${declaration.file} is ${String(declaration.value)}: it must be a whole number from 0 to ${String(MAX_RETRIES)}`,
      );
    }
    values[declaration.setting] = Math.max(values[declaration.setting] ?? 0, declaration.value);
  }
  return values;
}

function testsChoice(build, { layers }) {
  const declarations = testRetryDeclarations(build);
  if (declarations.length === 0) {
    throw new Error(missingProjectConfig('tests', LOOKED));
  }
  return {
    arguments: layers.nitpickerFirst ? {} : testRetryValues(declarations),
    files: [],
  };
}

function testsNotice(declarations, layers) {
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

function noticeable(declarations) {
  return declarations.filter((declaration) => declaration.value !== 0);
}

export const TESTS = {
  label: 'test retry',
  declarations: testRetryDeclarations,
  noticeable,
  choice: testsChoice,
  notice: testsNotice,
};
