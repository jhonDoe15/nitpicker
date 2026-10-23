import { classesOf } from './discovery/declarations.mjs';
import { functionOwners, functionsOf } from './discovery/functions.mjs';
import { importsOf, packageOf, typeAliasesOf } from './discovery/imports.mjs';
import { escaped } from './discovery/text-scan.mjs';
import { constantValues, DISABLING_BASE } from './honesty/skip-constants.mjs';

const MAIN_SET = /\bsetMain\s*\(/u;
const MAIN_RULE_NAMES = [
  'MainDispatcherRule|MainCoroutineRule|MainCoroutineExtension|MainDispatcherExtension',
  'CoroutineTestRule|TestMainDispatcher',
].join('|');
const WELL_KNOWN_MAIN_RULES = new RegExp(String.raw`\b(?:${MAIN_RULE_NAMES})\b`, 'u');
const TEST_SCOPE_FLAG = /\b(?:coroutineTestScope|testCoroutineDispatcher)\s*=\s*(true|false)\b/gu;
const PROJECT_CONFIG = /ProjectConfig$/u;
const IN_CONFIG = /\.\s*config\s*\([^)]*$/u;
const MAX_SUPER_DEPTH = 6;
const KOTLINX_DELAY = 'kotlinx.coroutines.delay';
const CONFIG_WINDOW = 200;
const MAX_SUPER_CLASSES = 100;

function regionsOf(files) {
  const regions = new Map();
  for (const { scanned } of files) {
    for (const klass of classesOf(scanned)) {
      const entry = {
        supers: klass.supers.map(({ name }) => name),
        text: scanned.code.slice(klass.start, klass.end),
      };
      regions.set(klass.name, [...(regions.get(klass.name) ?? []), entry]);
    }
  }
  return regions;
}

function addSubclasses(regions, names) {
  const before = names.size;
  for (const [name, entries] of regions) {
    if (entries.some(({ supers }) => supers.some((superName) => names.has(superName)))) {
      names.add(name);
    }
  }
  return names.size === before;
}

function replacersOf(regions) {
  const names = new Set(
    [...regions]
      .filter(([, entries]) => entries.some(({ text }) => MAIN_SET.test(text)))
      .map(([name]) => name),
  );
  Array.from({ length: MAX_SUPER_DEPTH }).some(() => addSubclasses(regions, names));
  return names.size === 0
    ? undefined
    : new RegExp(String.raw`\b(?:${[...names].map(escaped).join('|')})\b`, 'u');
}

function lastFlag(text) {
  const values = [...text.matchAll(TEST_SCOPE_FLAG)]
    .filter(
      (match) => !IN_CONFIG.test(text.slice(Math.max(0, match.index - CONFIG_WINDOW), match.index)),
    )
    .map((match) => match[1] === 'true');
  return values.at(-1);
}

function configEnabled(regions) {
  return [...regions].some(
    ([name, entries]) =>
      (PROJECT_CONFIG.test(name) ||
        entries.some(({ supers }) => supers.some((s) => PROJECT_CONFIG.test(s)))) &&
      entries.some(({ text }) => lastFlag(text) === true),
  );
}

function topLevelFunctions(files) {
  const byPackage = new Map();
  for (const { scanned } of files) {
    const owners = functionOwners(scanned);
    const names = functionsOf(scanned)
      .filter(({ offset }) => owners.get(offset) === undefined)
      .map(({ name }) => name);
    const pack = packageOf(scanned);
    byPackage.set(pack, new Set([...(byPackage.get(pack) ?? []), ...names]));
  }
  return byPackage;
}

function addDisabling(names, { aliases, annotations }) {
  const before = names.size;
  const added = [
    ...aliases.filter(([, target]) => names.has(target)).map(([alias]) => alias),
    ...annotations.filter(({ uses }) => uses.some((use) => names.has(use))).map(({ name }) => name),
  ];
  for (const name of added) {
    names.add(name);
  }
  return names.size === before;
}

function projectDisabling(files) {
  const names = new Set(DISABLING_BASE);
  const aliases = files.flatMap(({ scanned }) => [
    ...typeAliasesOf(scanned),
    ...[...importsOf(scanned).aliases].map(([alias, { target }]) => [alias, target]),
  ]);
  const annotations = files.flatMap(({ scanned }) =>
    classesOf(scanned)
      .filter((klass) => klass.modifiers.has('annotation'))
      .map((klass) => ({ name: klass.name, uses: klass.annotations.map(({ name }) => name) })),
  );
  Array.from({ length: MAX_SUPER_DEPTH }).some(() => addDisabling(names, { aliases, annotations }));
  return names;
}

function mergedConstants(files) {
  const merged = new Map();
  const conflicting = new Set();
  for (const [name, value] of files.flatMap(({ scanned }) => [...constantValues(scanned)])) {
    if (merged.has(name) && merged.get(name) !== value) {
      conflicting.add(name);
    }
    merged.set(name, value);
  }
  return new Map([...merged].filter(([name]) => !conflicting.has(name)));
}

export function projectFlags(files) {
  const regions = regionsOf(files);
  return {
    regions,
    replacers: replacersOf(regions),
    coroutineTestScope: configEnabled(regions),
    topLevel: topLevelFunctions(files),
    disabling: projectDisabling(files),
    constants: mergedConstants(files),
  };
}

function regionTexts(project, scanned, suite) {
  const own = [suite.klass, ...suite.ancestors.toReversed()];
  const supers = new Map();
  const queue = own.flatMap((klass) => klass.supers.map(({ name }) => name));
  for (const name of queue) {
    if (!supers.has(name) && supers.size < MAX_SUPER_CLASSES) {
      const entries = project.regions.get(name) ?? [];
      supers.set(name, entries);
      queue.push(...entries.flatMap(({ supers: parents }) => parents));
    }
  }
  return [
    ...own.map((klass) => scanned.code.slice(klass.start, klass.end)),
    ...[...supers.values()].flat().map(({ text }) => text),
  ];
}

export function suiteFlags(project, scanned, suite) {
  const texts = regionTexts(project, scanned, suite);
  const mainReplaced = texts.some(
    (text) =>
      MAIN_SET.test(text) ||
      WELL_KNOWN_MAIN_RULES.test(text) ||
      (project.replacers !== undefined && project.replacers.test(text)),
  );
  const explicit = texts.map(lastFlag).find((value) => value !== undefined);
  return { mainReplaced, coroutineTestScope: explicit ?? project.coroutineTestScope };
}

export function delayNames(scanned, project) {
  const imports = importsOf(scanned);
  const explicit = imports.explicit.get('delay');
  const own = functionsOf(scanned).some(({ name }) => name === 'delay');
  const samePackage = project.topLevel.get(packageOf(scanned))?.has('delay') === true;
  const shadowed = explicit === undefined ? own || samePackage : explicit !== KOTLINX_DELAY;
  const aliases = [...imports.aliases]
    .filter(([, { qualified }]) => qualified === KOTLINX_DELAY)
    .map(([alias]) => alias);
  return new Set([...(shadowed ? [] : ['delay']), ...aliases]);
}
