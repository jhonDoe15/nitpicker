import { existsSync, readFileSync } from 'node:fs';
import { parseXml } from '../../../../../shared/ingest/common.mjs';
import { resolveInside } from '../../../../../shared/conventions/read-inside.mjs';
import { missingProjectConfig } from '../../../../../shared/conventions/tool-precedence.mjs';
import { configurations, pluginsNamed, textsOf } from '../../../builds/narrowing/maven-sources.mjs';
import {
  declarationText,
  gradlePath,
  gradleSettings,
  mavenPath,
  mavenText,
  quotedStrings,
} from './declared-build.mjs';

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
export const NITPICKER_SPOTBUGS = { effort: 'default', threshold: 'medium' };
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

function choiceIn(value, names) {
  const words = value.toLowerCase().match(/[a-z]+/gu) ?? [];
  return words.findLast((word) => names.includes(word));
}

function gradleDeclaration(found) {
  const base = { file: found.file, text: found.text.trim() };
  if (found.name === 'effort') {
    return { ...base, setting: 'effort', value: choiceIn(found.value, EFFORTS) };
  }
  if (found.name === 'reportLevel') {
    const named = choiceIn(found.value, [...THRESHOLD_NAMES.keys()]);
    return { ...base, setting: 'threshold', value: THRESHOLD_NAMES.get(named) };
  }
  if (found.name === 'excludeFilter') {
    return { ...base, setting: 'excludeFilter', path: gradlePath(found) };
  }
  return { ...base, setting: found.name, value: quotedStrings(found.value).join(',') };
}

function gradleDeclarations(scripts) {
  return gradleSettings(scripts, {
    context: GRADLE_CONTEXT,
    skip: GRADLE_SKIP,
    names: ['effort', 'reportLevel', 'excludeFilter', ...DROPPING],
  }).map(gradleDeclaration);
}

function mavenFilters(poms, pom, configuration) {
  return [
    ...textsOf(configuration, 'excludeFilterFile'),
    ...textsOf(configuration, 'excludeFilterFiles', 'excludeFilterFile'),
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

function mavenChoices(poms, pom, configuration) {
  const effort = textsOf(configuration, 'effort').map((text) => mavenText(poms, pom, text));
  const threshold = textsOf(configuration, 'threshold').map((text) => mavenText(poms, pom, text));
  return [
    ...effort.map((text) => ({ setting: 'effort', value: choiceIn(text, EFFORTS), text })),
    ...threshold.map((text) => ({
      setting: 'threshold',
      value: THRESHOLD_NAMES.get(choiceIn(text, [...THRESHOLD_NAMES.keys()])),
      text,
    })),
    ...[...MAVEN_DROPPING].flatMap(([element, setting]) =>
      textsOf(configuration, element).map((text) => ({ setting, value: text, text })),
    ),
  ].map((declaration) => ({
    ...declaration,
    file: pom.file,
    text: `<${elementOf(declaration.setting)}>${declaration.text}</${elementOf(declaration.setting)}>`,
  }));
}

function elementOf(setting) {
  return [...MAVEN_DROPPING].find(([, name]) => name === setting)?.[0] ?? setting;
}

function mavenDeclarations(poms) {
  return poms
    .filter((pom) => pom.project !== undefined)
    .flatMap((pom) =>
      pluginsNamed(pom.project, MAVEN_PLUGIN)
        .flatMap((plugin) => configurations(plugin))
        .flatMap((configuration) => [
          ...mavenChoices(poms, pom, configuration),
          ...mavenFilters(poms, pom, configuration),
        ]),
    );
}

export function spotbugsDeclarations(build) {
  return [...gradleDeclarations(build.scripts), ...mavenDeclarations(build.poms)];
}

function highest(declarations, setting, order) {
  const values = declarations
    .filter((declaration) => declaration.setting === setting && declaration.value !== undefined)
    .map((declaration) => declaration.value);
  return values.toSorted((left, right) => order.indexOf(right) - order.indexOf(left))[0];
}

function raised({ declarations, setting, order, projectWins }) {
  const nitpicker = NITPICKER_SPOTBUGS[setting];
  const declared = highest(declarations, setting, order);
  const applies =
    projectWins && declared !== undefined && order.indexOf(declared) > order.indexOf(nitpicker);
  return applies ? declared : nitpicker;
}

function notApplied(declarations, { effort, threshold }) {
  return declarations.filter(
    (declaration) =>
      DROPPING.includes(declaration.setting) ||
      (declaration.setting === 'effort' && declaration.value !== effort) ||
      (declaration.setting === 'threshold' && declaration.value !== threshold),
  );
}

export function spotbugsArguments({ effort, threshold }, filters = []) {
  return [`-effort:${effort}`, `-${threshold}`, ...filters.flatMap((file) => ['-exclude', file])];
}

export function spotbugsLayers(declarations, { projectWins }) {
  const effort = raised({ declarations, setting: 'effort', order: EFFORTS, projectWins });
  const threshold = raised({ declarations, setting: 'threshold', order: THRESHOLDS, projectWins });
  return {
    effort,
    threshold,
    filters: declarations.filter((declaration) => declaration.setting === 'excludeFilter'),
    notApplied: notApplied(declarations, { effort, threshold }),
  };
}

const SPOTBUGS_LOOKED =
  'SpotBugs settings in the build (excludeFilter, effort or reportLevel of a spotbugs block in a build.gradle(.kts), or excludeFilterFile, effort or threshold of spotbugs-maven-plugin in a pom.xml)';

function spotbugsFilter(filter, root) {
  if (filter.path === undefined) {
    throw new Error(
      `Could not resolve the SpotBugs exclude filter in ${filter.file} (${filter.text}): name a file inside the project, such as file("config/spotbugs/exclude.xml") or <excludeFilterFile>config/spotbugs/exclude.xml</excludeFilterFile>`,
    );
  }
  const absolute = resolveInside(root, filter.path);
  if (absolute === undefined || !existsSync(absolute)) {
    throw new Error(
      missingProjectConfig(
        'spotbugs',
        `${filter.path} (the SpotBugs exclude filter ${filter.file} names)`,
      ),
    );
  }
  let element;
  try {
    element = parseXml(readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(
      `The SpotBugs exclude filter ${filter.path} is not valid XML: ${error.message}`,
    );
  }
  if (element.name !== 'FindBugsFilter') {
    throw new Error(
      `The SpotBugs exclude filter ${filter.path} has <${element.name}> as its root element; SpotBugs reads <FindBugsFilter>`,
    );
  }
  return absolute;
}

function spotbugsChoice(build, { layers, root }) {
  const declarations = spotbugsDeclarations(build);
  if (declarations.length === 0) {
    throw new Error(missingProjectConfig('spotbugs', SPOTBUGS_LOOKED));
  }
  const layered = spotbugsLayers(declarations, { projectWins: !layers.nitpickerFirst });
  const filters = layered.filters.map((filter) => spotbugsFilter(filter, root));
  return { arguments: spotbugsArguments(layered, filters), files: filters };
}

function spotbugsNotice(declarations, layers) {
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

export const SPOTBUGS = {
  label: 'SpotBugs',
  declarations: spotbugsDeclarations,
  choice: spotbugsChoice,
  notice: spotbugsNotice,
};
