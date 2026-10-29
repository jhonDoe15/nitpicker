import { childAt } from '../../../../../shared/ingest/common.mjs';
import { missingProjectConfig } from '../../../../../shared/conventions/tool-precedence.mjs';
import { configurations, pluginsNamed, textsOf } from '../../../builds/narrowing/maven-sources.mjs';
import { declarationText, gradleSettings, mavenText, quotedStrings } from './declared-build.mjs';

export const NITPICKER_PIT = { threads: 2, timeoutConst: 4000, timeoutFactor: 1.25 };
const LOGGING_CLASSES = [
  ...['java.util.logging', 'org.apache.log4j', 'org.apache.logging.log4j'],
  ...['org.slf4j', 'org.apache.commons.logging', 'org.jboss.logging'],
];
const PIT_DEFAULT_MUTATORS = [
  ...['INVERT_NEGS', 'MATH', 'VOID_METHOD_CALLS', 'NEGATE_CONDITIONALS', 'CONDITIONALS_BOUNDARY'],
  ...['INCREMENTS', 'TRUE_RETURNS', 'FALSE_RETURNS', 'PRIMITIVE_RETURNS', 'EMPTY_RETURNS'],
  'NULL_RETURNS',
];
const LISTS = [
  'excludedClasses',
  'excludedMethods',
  'excludedTestClasses',
  'avoidCallsTo',
  'jvmArgs',
];
const NUMBERS = ['threads', 'timeoutConst', 'timeoutFactor'];
const KEPT = [
  ...[
    'targetClasses',
    'targetTests',
    'features',
    'outputFormats',
    'reportDir',
    'timestampedReports',
  ],
  ...['mutationThreshold', 'coverageThreshold', 'testStrengthThreshold', 'maxSurviving'],
  ...['maxMutationsPerClass', 'skipFailingTests', 'detectInlinedCode', 'fullMutationMatrix'],
  ...['excludedGroups', 'includedGroups', 'excludedRunners', 'excludedTestMethods'],
  ...['historyInputLocation', 'historyOutputLocation', 'withHistory', 'mutationEngine'],
];
const GRADLE_NAMES = new Map([
  ['mutators', 'mutators'],
  ['timeoutConstInMillis', 'timeoutConst'],
  ...[...LISTS, ...NUMBERS, ...KEPT].map((name) => [name, name]),
]);
const MAVEN_NAMES = new Map([
  ['mutators', 'mutators'],
  ['timeoutConstant', 'timeoutConst'],
  ['argLine', 'argLine'],
  ...[...LISTS, ...NUMBERS, ...KEPT].map((name) => [name, name]),
]);
const LOOKED =
  'PIT settings in the build (a pitest block in a build.gradle(.kts), or the configuration of pitest-maven in a pom.xml)';

function numberIn(text) {
  return Number(/\d+(?:\.\d+)?/u.exec(text)?.[0]);
}

function gradleDeclarations(scripts) {
  return gradleSettings(scripts, {
    context: /pitest/iu,
    names: [...GRADLE_NAMES.keys()],
  }).map((found) => {
    const setting = GRADLE_NAMES.get(found.name);
    const values = quotedStrings(found.value);
    const value = NUMBERS.includes(setting) ? numberIn(found.value) : values;
    return { file: found.file, text: found.text.trim(), setting, value };
  });
}

function elementValues(configuration, element) {
  const found = childAt(configuration, element);
  if (found === undefined) {
    return [];
  }
  const children = found.children.map((child) => child.text?.trim()).filter(Boolean);
  return children.length > 0 ? [children] : [[found.text?.trim()].filter(Boolean)];
}

function mavenSetting(poms, pom, configuration, [element, setting]) {
  const texts = NUMBERS.includes(setting)
    ? textsOf(configuration, element).map((text) => numberIn(mavenText(poms, pom, text)))
    : elementValues(configuration, element).map((values) =>
        values.map((text) => mavenText(poms, pom, text)),
      );
  return texts.map((value) => ({
    file: pom.file,
    text: `<${element}>`,
    setting: setting === 'argLine' ? 'jvmArgs' : setting,
    value: setting === 'argLine' ? value.flatMap((text) => text.split(/\s+/u)) : value,
  }));
}

function mavenDeclarations(poms) {
  return poms
    .filter((pom) => pom.project !== undefined)
    .flatMap((pom) =>
      pluginsNamed(pom.project, new Set(['pitest-maven']))
        .flatMap((plugin) => configurations(plugin))
        .flatMap((configuration) =>
          [...MAVEN_NAMES].flatMap((entry) => mavenSetting(poms, pom, configuration, entry)),
        ),
    );
}

export function pitDeclarations(build) {
  return [...gradleDeclarations(build.scripts), ...mavenDeclarations(build.poms)];
}

function usable(value) {
  return typeof value !== 'string' || !(value.includes('$') || value.includes('@{'));
}

function valuesOf(declarations, setting) {
  return declarations
    .filter((declaration) => declaration.setting === setting)
    .flatMap((declaration) => declaration.value)
    .filter((value) => value !== undefined && !Number.isNaN(value) && usable(value));
}

function highest(declarations, setting) {
  const values = valuesOf(declarations, setting);
  return values.length === 0 ? undefined : Math.max(...values);
}

function chosenNumbers(declarations, projectWins) {
  const timeoutConst = Math.max(
    NITPICKER_PIT.timeoutConst,
    highest(declarations, 'timeoutConst') ?? 0,
  );
  const timeoutFactor = Math.max(
    NITPICKER_PIT.timeoutFactor,
    highest(declarations, 'timeoutFactor') ?? 0,
  );
  const threads =
    (projectWins ? highest(declarations, 'threads') : undefined) ?? NITPICKER_PIT.threads;
  return { threads, timeoutConst, timeoutFactor };
}

function lowered(declaration, numbers) {
  return (
    NUMBERS.includes(declaration.setting) &&
    declaration.value !== numbers[declaration.setting] &&
    declaration.setting !== 'threads'
  );
}

function notApplied(declarations, { projectWins, numbers }) {
  return declarations.filter(
    (declaration) =>
      KEPT.includes(declaration.setting) ||
      lowered(declaration, numbers) ||
      (declaration.setting === 'threads' && !projectWins) ||
      (declaration.setting === 'mutators' &&
        (!projectWins || declaration.value.some((name) => name.startsWith('-')))) ||
      (Array.isArray(declaration.value) && !declaration.value.every(usable)),
  );
}

export function pitLayers(declarations, { projectWins }) {
  const numbers = chosenNumbers(declarations, projectWins);
  const mutators = projectWins
    ? valuesOf(declarations, 'mutators').filter((name) => !name.startsWith('-'))
    : [];
  return {
    ...numbers,
    mutators: [...new Set([...PIT_DEFAULT_MUTATORS, ...mutators])],
    lists: Object.fromEntries(
      LISTS.map((setting) => [setting, [...new Set(valuesOf(declarations, setting))]]),
    ),
    notApplied: notApplied(declarations, { projectWins, numbers }),
  };
}

export function pitArguments(layers) {
  const lists = {
    ...layers.lists,
    avoidCallsTo: [...LOGGING_CLASSES, ...layers.lists.avoidCallsTo],
  };
  return [
    ...['--threads', String(layers.threads)],
    ...['--timeoutConst', String(layers.timeoutConst)],
    ...['--timeoutFactor', String(layers.timeoutFactor)],
    ...(layers.mutators.length === PIT_DEFAULT_MUTATORS.length
      ? []
      : ['--mutators', layers.mutators.join(',')]),
    ...LISTS.flatMap((setting) =>
      lists[setting].length === 0 ? [] : [`--${setting}`, lists[setting].join(',')],
    ),
  ];
}

export const NITPICKER_PIT_ARGUMENTS = ['--threads', String(NITPICKER_PIT.threads)];

function pitChoice(build, { layers }) {
  const declarations = pitDeclarations(build);
  if (declarations.length === 0) {
    throw new Error(missingProjectConfig('pit', LOOKED));
  }
  return {
    arguments: pitArguments(pitLayers(declarations, { projectWins: !layers.nitpickerFirst })),
    files: [],
  };
}

function shown(declaration) {
  const value = Array.isArray(declaration.value) ? declaration.value.join(',') : declaration.value;
  return declarationText({ setting: declaration.setting, value });
}

function pitNotice(declarations, layers) {
  const { notApplied: skipped } = pitLayers(declarations, { projectWins: !layers.nitpickerFirst });
  if (skipped.length === 0) {
    return [];
  }
  const listed = skipped.map((declaration) => `${shown(declaration)} (${declaration.file})`);
  return [
    `PIT keeps nitpicker's targets, reports, thresholds and features, its default mutators and timeouts as the floor; not applied from your build: ${[...new Set(listed)].join(', ')}`,
  ];
}

export const PIT = {
  label: 'PIT',
  declarations: pitDeclarations,
  choice: pitChoice,
  notice: pitNotice,
};
