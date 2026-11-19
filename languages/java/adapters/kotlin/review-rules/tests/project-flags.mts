import { classesOf } from './discovery/declarations.mts';
import { functionOwners, functionsOf } from './discovery/functions.mts';
import { importsOf, packageOf, typeAliasesOf } from './discovery/imports.mts';
import { escapeRegExp } from './discovery/text-scan.mts';
import { constantValues, DISABLING_BASE } from './honesty/skip-constants.mts';
import { projectIsolated } from './shared-state/shared-holders.mts';
import type { Suite, TestScanned } from './typed/discovery-types.mts';
import type { ProjectFlags, Region, ScannedFile } from './typed/report-types.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

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
const DELAY = 'delay';
const KOTLINX_DELAY = 'kotlinx.coroutines.delay';
const CONFIG_WINDOW = 200;
const MAX_SUPER_CLASSES = 100;

function regionsOf(files: ScannedFile[]): Map<string, Region[]> {
  const regions = new Map<string, Region[]>();
  for (const { scanned } of files) {
    for (const klass of classesOf(scanned)) {
      const entry: Region = {
        supers: klass.supers.map(({ name }) => name),
        text: scanned.code.slice(klass.start, klass.end),
      };
      regions.set(klass.name, [...(regions.get(klass.name) ?? []), entry]);
    }
  }
  return regions;
}

function addSubclasses(regions: Map<string, Region[]>, names: Set<string>): boolean {
  const before = names.size;
  for (const [name, entries] of regions) {
    if (entries.some(({ supers }) => supers.some((superName) => names.has(superName)))) {
      names.add(name);
    }
  }
  return names.size === before;
}

function replacersOf(regions: Map<string, Region[]>): RegExp | undefined {
  const names = new Set<string>(
    [...regions]
      .filter(([, entries]) => entries.some(({ text }) => MAIN_SET.test(text)))
      .map(([name]) => name),
  );
  Array.from({ length: MAX_SUPER_DEPTH }).some(() => addSubclasses(regions, names));
  return names.size === 0
    ? undefined
    : new RegExp(String.raw`\b(?:${[...names].map(escapeRegExp).join('|')})\b`, 'u');
}

function lastFlag(text: string): 'true' | 'false' | undefined {
  const values = [...text.matchAll(TEST_SCOPE_FLAG)]
    .filter(
      (match) => !IN_CONFIG.test(text.slice(Math.max(0, match.index - CONFIG_WINDOW), match.index)),
    )
    .map((match) => (match[1] === 'true' ? 'true' : 'false'));
  return values.at(-1);
}

function configEnabled(regions: Map<string, Region[]>): boolean {
  return [...regions].some(
    ([name, entries]) =>
      (PROJECT_CONFIG.test(name) ||
        entries.some(({ supers }) => supers.some((s) => PROJECT_CONFIG.test(s)))) &&
      entries.some(({ text }) => lastFlag(text) === 'true'),
  );
}

function topLevelFunctions(files: ScannedFile[]): Map<string, Set<string>> {
  const byPackage = new Map<string, Set<string>>();
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

type Annotated = { name: string; uses: string[] };

function addDisabling(
  names: Set<string>,
  { aliases, annotations }: { aliases: [string, string][]; annotations: Annotated[] },
): boolean {
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

function projectDisabling(files: ScannedFile[]): Set<string> {
  const names = new Set<string>(DISABLING_BASE);
  const aliases = files.flatMap(({ scanned }): [string, string][] => [
    ...typeAliasesOf(scanned),
    ...[...importsOf(scanned).aliases].map(([alias, { target }]): [string, string] => [
      alias,
      target,
    ]),
  ]);
  const annotations = files.flatMap(({ scanned }): Annotated[] =>
    classesOf(scanned)
      .filter((klass) => klass.modifiers.has('annotation'))
      .map((klass) => ({ name: klass.name, uses: klass.annotations.map(({ name }) => name) })),
  );
  Array.from({ length: MAX_SUPER_DEPTH }).some(() => addDisabling(names, { aliases, annotations }));
  return names;
}

function mergedConstants(files: ScannedFile[]): Map<string, boolean> {
  const merged = new Map<string, boolean>();
  const conflicting = new Set<string>();
  for (const [name, value] of files.flatMap(({ scanned }) => [...constantValues(scanned)])) {
    if (merged.has(name) && merged.get(name) !== value) {
      conflicting.add(name);
    }
    merged.set(name, value);
  }
  return new Map([...merged].filter(([name]) => !conflicting.has(name)));
}

export function projectFlags(files: ScannedFile[]): ProjectFlags {
  const regions = regionsOf(files);
  return {
    regions,
    replacers: replacersOf(regions),
    coroutineTestScope: configEnabled(regions),
    topLevel: topLevelFunctions(files),
    disabling: projectDisabling(files),
    constants: mergedConstants(files),
    kotestIsolated: projectIsolated(files),
  };
}

function regionTexts(
  project: ProjectFlags,
  scanned: TestScanned,
  suite: Pick<Suite, 'klass' | 'ancestors'>,
): string[] {
  const own = [suite.klass, ...suite.ancestors.toReversed()];
  const supers = new Map<string, Region[]>();
  const queue = own.flatMap((klass) => klass.supers.map(({ name }) => name));
  for (const name of queue) {
    if (!supers.has(name) && supers.size < MAX_SUPER_CLASSES) {
      const entries = project.regions.get(name) ?? [];
      supers.set(name, entries);
      appendAll(
        queue,
        entries.flatMap(({ supers: parents }) => parents),
      );
    }
  }
  return [
    ...own.map((klass) => scanned.code.slice(klass.start, klass.end)),
    ...[...supers.values()].flat().map(({ text }) => text),
  ];
}

export function suiteFlags(
  project: ProjectFlags,
  scanned: TestScanned,
  suite: Pick<Suite, 'klass' | 'ancestors'>,
): { mainReplaced: boolean; coroutineTestScope: boolean } {
  const texts = regionTexts(project, scanned, suite);
  const mainReplaced = texts.some(
    (text) =>
      MAIN_SET.test(text) ||
      WELL_KNOWN_MAIN_RULES.test(text) ||
      (project.replacers !== undefined && project.replacers.test(text)),
  );
  const explicit = texts.map(lastFlag).find((value) => value !== undefined);
  return {
    mainReplaced,
    coroutineTestScope: explicit === undefined ? project.coroutineTestScope : explicit === 'true',
  };
}

export function delayNames(scanned: TestScanned, project: ProjectFlags): Set<string> {
  const imports = importsOf(scanned);
  const explicit = imports.explicit.get(DELAY);
  const own = functionsOf(scanned).some(({ name }) => name === DELAY);
  const samePackage = project.topLevel.get(packageOf(scanned))?.has(DELAY) === true;
  const shadowed = explicit === undefined ? own || samePackage : explicit !== KOTLINX_DELAY;
  const aliases = [...imports.aliases]
    .filter(([, { qualified }]) => qualified === KOTLINX_DELAY)
    .map(([alias]) => alias);
  return new Set([...(shadowed ? [] : [DELAY]), ...aliases]);
}
