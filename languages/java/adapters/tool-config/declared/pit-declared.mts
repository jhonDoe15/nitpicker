import { readPitMutators } from '../../../builds/java-build.mts';
import { childAt } from '../../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../../shared/values/xml.mts';
import { missingProjectConfig as untypedMissingProjectConfig } from '../../../../../shared/conventions/tool-precedence.mjs';
import { mavenTextsOf } from '../../../builds/narrowing/maven-sources.mts';
import {
  declarationText,
  gradleSettings,
  mavenPluginDeclarations,
  mavenText,
  quotedStrings,
} from './declared-build.mts';
import { textOf } from '../../../../../shared/values/readers.mts';
import { largest as untypedLargest } from '../../../../../shared/lists/items.mjs';
import type {
  ChoiceContext,
  DeclaredBuild,
  Declaration,
  Pom,
  PitLayers,
  PitNumbers,
  ChoiceLayers,
  Script,
  ToolChoice,
  ToolSpec,
} from './declared-types.mts';

const missingProjectConfig: (tool: string, looked: string) => string = untypedMissingProjectConfig;
const largest: (values: readonly (string | number)[]) => number = untypedLargest;
type Scalar = string | number;
type PitValue = number | string[];

const NITPICKER_PIT = { threads: 2, timeoutConst: 4000, timeoutFactor: 1.25 };
const LOGGING_CLASSES = [
  ...['java.util.logging', 'org.apache.log4j', 'org.apache.logging.log4j'],
  ...['org.slf4j', 'org.apache.commons.logging', 'org.jboss.logging'],
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
const GRADLE_NAMES = new Map<string, string>([
  ['mutators', 'mutators'],
  ['timeoutConstInMillis', 'timeoutConst'],
  ...[...LISTS, ...NUMBERS, ...KEPT].map((name): [string, string] => [name, name]),
]);
const MAVEN_NAMES = new Map<string, string>([
  ['mutators', 'mutators'],
  ['timeoutConstant', 'timeoutConst'],
  ['argLine', 'argLine'],
  ...[...LISTS, ...NUMBERS, ...KEPT].map((name): [string, string] => [name, name]),
]);
const LOOKED =
  'PIT settings in the build (a pitest block in a build.gradle(.kts), or the configuration of pitest-maven in a pom.xml)';

function numberIn(text: string): number {
  const bare = text
    .trim()
    .replace(/^BigDecimal\.valueOf\(/u, '')
    .replace(/\)+$/u, '');
  const literal = /^(\d[\d_]*(?:\.\d+)?)[DFLdfl]?$/u.exec(bare)?.[1];
  return literal === undefined ? Number.NaN : Number(literal.replaceAll('_', ''));
}

function pieces(values: readonly string[]): string[] {
  return values.flatMap((value) => value.split(',')).map((value) => value.trim());
}

function gradleDeclarations(scripts: readonly Script[]): Declaration[] {
  return gradleSettings(scripts, {
    context: /pitest/iu,
    names: [...GRADLE_NAMES.keys()],
  }).map((found) => {
    const setting = GRADLE_NAMES.get(found.name) ?? '';
    const values =
      setting === 'jvmArgs' ? quotedStrings(found.value) : pieces(quotedStrings(found.value));
    const value = NUMBERS.includes(setting) ? numberIn(found.value) : values;
    return {
      file: found.file,
      text: found.text.trim(),
      setting,
      value,
      ...(found.conditional ? ({ conditional: true } as const) : {}),
    };
  });
}

function nonEmpty(text: string | undefined): string[] {
  return text === undefined || text === '' ? [] : [text];
}

function elementValues(configuration: XmlElement, element: string): string[][] {
  const found = childAt(configuration, element);
  if (found === undefined) {
    return [];
  }
  const children = found.children.flatMap((child) => nonEmpty(child.text?.trim()));
  return children.length > 0 ? [children] : [nonEmpty(found.text?.trim())];
}

function mavenValue(setting: string, value: PitValue): PitValue {
  if (typeof value === 'number') {
    return value;
  }
  if (setting === 'argLine') {
    return value.flatMap((text) => text.split(/\s+/u));
  }
  return setting === 'jvmArgs' ? value : pieces(value);
}

function mavenSetting(
  { poms, pom, configuration }: { poms: readonly Pom[]; pom: Pom; configuration: XmlElement },
  [element, setting]: readonly [string, string],
): Declaration[] {
  const texts: PitValue[] = NUMBERS.includes(setting)
    ? mavenTextsOf(configuration, element).map((text) => numberIn(mavenText(poms, pom, text)))
    : elementValues(configuration, element).map((values) =>
        values.map((text) => mavenText(poms, pom, text)),
      );
  return texts.map((value) => ({
    file: pom.file,
    text: `<${element}>`,
    setting: setting === 'argLine' ? 'jvmArgs' : setting,
    value: mavenValue(setting, value),
  }));
}

function mavenDeclarations(poms: readonly Pom[]): Declaration[] {
  return mavenPluginDeclarations(poms, new Set(['pitest-maven']), (context) =>
    [...MAVEN_NAMES].flatMap((entry) => mavenSetting(context, entry)),
  );
}

export function pitDeclarations(build: DeclaredBuild): Declaration[] {
  return [...gradleDeclarations(build.scripts), ...mavenDeclarations(build.poms)];
}

function scalarsOf(value: unknown): Scalar[] {
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.filter(
    (item): item is Scalar => typeof item === 'string' || typeof item === 'number',
  );
}

function usable(value: Scalar, setting: string): boolean {
  if (typeof value === 'number') {
    return setting !== 'threads' || (Number.isInteger(value) && value >= 1);
  }
  const everything = /^[*.?]+$/u.test(value) && LISTS.includes(setting);
  const removal = setting === 'mutators' && /^[-!]/u.test(value);
  const split = setting === 'jvmArgs' && value.includes(',');
  return !(value.includes('$') || value.includes('@{') || everything || removal || split);
}

function valuesOf(declarations: readonly Declaration[], setting: string): Scalar[] {
  return declarations
    .filter((declaration) => declaration.setting === setting && declaration.conditional !== true)
    .flatMap((declaration) => scalarsOf(declaration.value))
    .filter((value) => !Number.isNaN(value) && usable(value, setting));
}

function highest(declarations: readonly Declaration[], setting: string): number | undefined {
  const values = valuesOf(declarations, setting).filter(
    (value): value is number => typeof value === 'number',
  );
  return values.length === 0 ? undefined : largest(values);
}

function chosenNumbers(declarations: readonly Declaration[], projectWins: boolean): PitNumbers {
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

function lowered(
  declaration: Declaration,
  numbers: Readonly<Record<string, number | undefined>>,
): boolean {
  return (
    NUMBERS.includes(declaration.setting) &&
    declaration.value !== numbers[declaration.setting] &&
    declaration.setting !== 'threads'
  );
}

function notApplied(
  declarations: readonly Declaration[],
  { projectWins, numbers }: { projectWins: boolean; numbers: PitNumbers },
): Declaration[] {
  return declarations.filter(
    (declaration) =>
      declaration.conditional === true ||
      KEPT.includes(declaration.setting) ||
      lowered(declaration, numbers) ||
      (declaration.setting === 'threads' && !projectWins) ||
      (declaration.setting === 'mutators' && !projectWins) ||
      scalarsOf(declaration.value).some((value) => !usable(value, declaration.setting)),
  );
}

export function pitLayers(
  declarations: readonly Declaration[],
  { projectWins }: { projectWins: boolean },
): PitLayers {
  const numbers = chosenNumbers(declarations, projectWins);
  const mutators = projectWins ? valuesOf(declarations, 'mutators').map(textOf) : [];
  return {
    ...numbers,
    mutators: [...new Set([...readPitMutators(), ...mutators])],
    lists: Object.fromEntries(
      LISTS.map((setting) => [setting, [...new Set(valuesOf(declarations, setting).map(textOf))]]),
    ),
    notApplied: notApplied(declarations, { projectWins, numbers }),
  };
}

export function pitArguments(layers: PitLayers): string[] {
  const lists: Record<string, string[] | undefined> = {
    ...layers.lists,
    avoidCallsTo: [...LOGGING_CLASSES, ...(layers.lists['avoidCallsTo'] ?? [])],
  };
  return [
    ...['--threads', String(layers.threads)],
    ...['--timeoutConst', String(layers.timeoutConst)],
    ...['--timeoutFactor', String(layers.timeoutFactor)],
    ...['--mutators', layers.mutators.join(',')],
    ...LISTS.flatMap((setting) =>
      (lists[setting] ?? []).length === 0 ? [] : [`--${setting}`, (lists[setting] ?? []).join(',')],
    ),
  ];
}

export function nitpickerPitArguments(): string[] {
  return ['--threads', String(NITPICKER_PIT.threads), '--mutators', readPitMutators().join(',')];
}

function pitChoice(build: DeclaredBuild, { layers }: ChoiceContext): ToolChoice {
  const declarations = pitDeclarations(build);
  if (declarations.length === 0) {
    throw new Error(missingProjectConfig('pit', LOOKED));
  }
  return {
    arguments: pitArguments(pitLayers(declarations, { projectWins: !layers.nitpickerFirst })),
    files: [],
  };
}

function shown(declaration: Declaration): string {
  const value: unknown = Array.isArray(declaration.value)
    ? declaration.value.join(',')
    : declaration.value;
  return declarationText({ setting: declaration.setting, value });
}

function pitNotice(declarations: readonly Declaration[], layers: ChoiceLayers): string[] {
  const { notApplied: skipped } = pitLayers(declarations, { projectWins: !layers.nitpickerFirst });
  if (skipped.length === 0) {
    return [];
  }
  const listed = skipped.map((declaration) => `${shown(declaration)} (${declaration.file})`);
  return [
    `PIT keeps nitpicker's targets, reports, thresholds and features, its default mutators and timeouts as the floor; not applied from your build: ${[...new Set(listed)].join(', ')}`,
  ];
}

export const PIT: ToolSpec = {
  label: 'PIT',
  declarations: pitDeclarations,
  choice: pitChoice,
  notice: pitNotice,
};
