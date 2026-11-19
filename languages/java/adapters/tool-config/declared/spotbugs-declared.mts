import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseXml } from '../../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../../shared/values/xml.mts';
import { resolveInside as untypedResolveInside } from '../../../../../shared/conventions/read-inside.mjs';
import { missingProjectConfig as untypedMissingProjectConfig } from '../../../../../shared/conventions/tool-precedence.mjs';
import { fieldOf, messageOf, textOf } from '../../../../../shared/values/readers.mts';
import { mavenTextsOf } from '../../../builds/narrowing/maven-sources.mts';
import {
  declarationText,
  gradlePath,
  gradleSettings,
  mavenPath,
  mavenPluginDeclarations,
  mavenText,
  quotedStrings,
} from './declared-build.mts';
import type {
  ChoiceContext,
  DeclaredBuild,
  Declaration,
  FoundSetting,
  Pom,
  ChoiceLayers,
  Script,
  SpotbugsLayers,
  ToolChoice,
  ToolSpec,
} from './declared-types.mts';

const resolveInside: (root: string, file: string) => string | undefined = untypedResolveInside;
const missingProjectConfig: (tool: string, looked: string) => string = untypedMissingProjectConfig;

const EFFORTS = ['min', 'less', 'default', 'more', 'max'];
const THRESHOLDS = ['high', 'medium', 'low', 'experimental'];
const THRESHOLD_NAMES = new Map([
  ['high', 'high'],
  ['medium', 'medium'],
  ['default', 'medium'],
  ['low', 'low'],
  ['exp', 'experimental'],
  ['experimental', 'experimental'],
]);
export const NITPICKER_SPOTBUGS = {
  effort: 'default',
  threshold: 'medium',
};
const DROPPING = ['includeFilter', 'onlyAnalyze', 'visitors', 'omitVisitors', 'baselineFile'];
const GRADLE_CONTEXT = /spotbugs/iu;
const GRADLE_SKIP = /spotbugs\w*test/iu;
const MAVEN_PLUGIN = new Set(['spotbugs-maven-plugin']);
const MAVEN_DROPPING = new Map([
  ['includeFilterFile', 'includeFilter'],
  ['onlyAnalyze', 'onlyAnalyze'],
  ['visitors', 'visitors'],
  ['omitVisitors', 'omitVisitors'],
  ['excludeBugsFile', 'baselineFile'],
]);

function choiceIn(value: string, names: readonly string[]): string | undefined {
  const words = value.toLowerCase().match(/[a-z]+/gu) ?? [];
  return words.findLast((word) => names.includes(word));
}

function conditionalOf(found: FoundSetting): { readonly conditional?: true } {
  return found.conditional ? { conditional: true } : {};
}

function gradleDeclaration(found: FoundSetting): Declaration {
  const base = { file: found.file, text: found.text.trim(), ...conditionalOf(found) };
  if (found.name === 'effort') {
    return { ...base, setting: 'effort', value: choiceIn(found.value, EFFORTS) };
  }
  if (found.name === 'reportLevel') {
    const named = choiceIn(found.value, [...THRESHOLD_NAMES.keys()]);
    return {
      ...base,
      setting: 'threshold',
      value: named === undefined ? undefined : THRESHOLD_NAMES.get(named),
    };
  }
  if (found.name === 'excludeFilter') {
    return { ...base, setting: 'excludeFilter', path: gradlePath(found) };
  }
  return { ...base, setting: found.name, value: quotedStrings(found.value).join(',') };
}

function gradleDeclarations(scripts: readonly Script[]): Declaration[] {
  return gradleSettings(scripts, {
    context: GRADLE_CONTEXT,
    skip: GRADLE_SKIP,
    names: ['effort', 'reportLevel', 'excludeFilter', ...DROPPING],
  }).map(gradleDeclaration);
}

function mavenFilters(poms: readonly Pom[], pom: Pom, configuration: XmlElement): Declaration[] {
  return [
    ...mavenTextsOf(configuration, 'excludeFilterFile'),
    ...mavenTextsOf(configuration, 'excludeFilterFiles', 'excludeFilterFile'),
  ]
    .flatMap((text) => text.split(','))
    .filter((text) => text.trim() !== '')
    .map((text) => ({
      file: pom.file,
      text: `<excludeFilterFile>${text.trim()}</excludeFilterFile>`,
      setting: 'excludeFilter',
      path: mavenPath(poms, pom, text),
    }));
}

function thresholdOf(text: string): string | undefined {
  const named = choiceIn(text, [...THRESHOLD_NAMES.keys()]);
  return named === undefined ? undefined : THRESHOLD_NAMES.get(named);
}

function mavenChoices(poms: readonly Pom[], pom: Pom, configuration: XmlElement): Declaration[] {
  const effort = mavenTextsOf(configuration, 'effort').map((text) => mavenText(poms, pom, text));
  const threshold = mavenTextsOf(configuration, 'threshold').map((text) =>
    mavenText(poms, pom, text),
  );
  return [
    ...effort.map((text) => ({ setting: 'effort', value: choiceIn(text, EFFORTS), text })),
    ...threshold.map((text) => ({
      setting: 'threshold',
      value: thresholdOf(text),
      text,
    })),
    ...[...MAVEN_DROPPING].flatMap(([element, setting]) =>
      mavenTextsOf(configuration, element).map((text) => ({ setting, value: text, text })),
    ),
  ].map((declaration) => ({
    ...declaration,
    file: pom.file,
    text: `<${elementOf(declaration.setting)}>${declaration.text}</${elementOf(declaration.setting)}>`,
  }));
}

function elementOf(setting: string): string {
  return [...MAVEN_DROPPING].find(([, name]) => name === setting)?.[0] ?? setting;
}

function mavenDeclarations(poms: readonly Pom[]): Declaration[] {
  return mavenPluginDeclarations(poms, MAVEN_PLUGIN, ({ pom, configuration }) => [
    ...mavenChoices(poms, pom, configuration),
    ...mavenFilters(poms, pom, configuration),
  ]);
}

export function spotbugsDeclarations(build: DeclaredBuild): Declaration[] {
  return [...gradleDeclarations(build.scripts), ...mavenDeclarations(build.poms)];
}

function highest(
  declarations: readonly Declaration[],
  setting: string,
  order: readonly string[],
): string | undefined {
  const values = declarations.flatMap((declaration) =>
    declaration.setting === setting && typeof declaration.value === 'string'
      ? [declaration.value]
      : [],
  );
  return values.toSorted((left, right) => order.indexOf(right) - order.indexOf(left))[0];
}

function raised({
  declarations,
  setting,
  order,
  projectWins,
}: {
  declarations: readonly Declaration[];
  setting: string;
  order: readonly string[];
  projectWins: boolean;
}): string {
  const nitpicker = textOf(fieldOf(NITPICKER_SPOTBUGS, setting));
  const declared = highest(declarations, setting, order);
  const applies =
    projectWins && declared !== undefined && order.indexOf(declared) > order.indexOf(nitpicker);
  return applies ? declared : nitpicker;
}

function notApplied(
  declarations: readonly Declaration[],
  { effort, threshold }: { effort: string; threshold: string },
): Declaration[] {
  return declarations.filter(
    (declaration) =>
      declaration.conditional === true ||
      DROPPING.includes(declaration.setting) ||
      (declaration.setting === 'effort' && declaration.value !== effort) ||
      (declaration.setting === 'threshold' && declaration.value !== threshold),
  );
}

export function spotbugsArguments(
  { effort, threshold }: { effort: string; threshold: string },
  filters: readonly string[] = [],
): string[] {
  return [`-effort:${effort}`, `-${threshold}`, ...filters.flatMap((file) => ['-exclude', file])];
}

export function spotbugsLayers(
  declarations: readonly Declaration[],
  { projectWins }: { projectWins: boolean },
): SpotbugsLayers {
  const plain = declarations.filter((declaration) => declaration.conditional !== true);
  const effort = raised({ declarations: plain, setting: 'effort', order: EFFORTS, projectWins });
  const threshold = raised({
    declarations: plain,
    setting: 'threshold',
    order: THRESHOLDS,
    projectWins,
  });
  return {
    effort,
    threshold,
    filters: plain.filter((declaration) => declaration.setting === 'excludeFilter'),
    notApplied: notApplied(declarations, { effort, threshold }),
  };
}

const SPOTBUGS_LOOKED =
  'SpotBugs settings in the build (excludeFilter, effort or reportLevel of a spotbugs block in a build.gradle(.kts), or excludeFilterFile, effort or threshold of spotbugs-maven-plugin in a pom.xml)';

function linksInside(root: string, file: string): boolean {
  const base = realpathSync(root);
  return realpathSync(file).startsWith(base + path.sep);
}

function spotbugsFilter(filter: Declaration, root: string): string {
  if (filter.path === undefined) {
    throw new Error(
      `Could not resolve the SpotBugs exclude filter in ${filter.file} (${filter.text ?? ''}): name a file inside the project, such as file("config/spotbugs/exclude.xml") or <excludeFilterFile>config/spotbugs/exclude.xml</excludeFilterFile>`,
    );
  }
  const absolute = resolveInside(root, filter.path);
  if (absolute === undefined || !existsSync(absolute) || !linksInside(root, absolute)) {
    throw new Error(
      missingProjectConfig(
        'spotbugs',
        `${filter.path} (the SpotBugs exclude filter ${filter.file} names)`,
      ),
    );
  }
  let element: XmlElement;
  try {
    element = parseXml(readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(
      `The SpotBugs exclude filter ${filter.path} is not valid XML: ${messageOf(error)}`,
      { cause: error },
    );
  }
  if (element.name !== 'FindBugsFilter') {
    throw new Error(
      `The SpotBugs exclude filter ${filter.path} has <${element.name}> as its root element; SpotBugs reads <FindBugsFilter>`,
    );
  }
  return absolute;
}

function spotbugsChoice(build: DeclaredBuild, { layers, root }: ChoiceContext): ToolChoice {
  const declarations = spotbugsDeclarations(build);
  if (declarations.length === 0) {
    throw new Error(missingProjectConfig('spotbugs', SPOTBUGS_LOOKED));
  }
  const layered = spotbugsLayers(declarations, { projectWins: !layers.nitpickerFirst });
  const filters = layered.filters.map((filter) => spotbugsFilter(filter, root));
  return { arguments: spotbugsArguments(layered, filters), files: filters };
}

function spotbugsNotice(declarations: readonly Declaration[], layers: ChoiceLayers): string[] {
  const layered = spotbugsLayers(declarations, { projectWins: !layers.nitpickerFirst });
  if (layered.notApplied.length === 0) {
    return [];
  }
  const skipped = layered.notApplied.map(
    (declaration) => `${declarationText(declaration)} (${declaration.file})`,
  );
  return [
    `SpotBugs runs with effort ${layered.effort} and threshold ${layered.threshold}, plus your exclude filters; not applied from your build: ${skipped.join(', ')}`,
  ];
}

export const SPOTBUGS: ToolSpec = {
  label: 'SpotBugs',
  declarations: spotbugsDeclarations,
  choice: spotbugsChoice,
  notice: spotbugsNotice,
};
