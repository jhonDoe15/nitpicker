import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { FOLDER_DEPTH_DEFAULTS } from '../../../../shared/policy-size.mjs';
import { classLimitFindings } from '../../../../shared/rules/size/class-limits.mjs';
import { folderDepthFindings } from '../../../../shared/rules/size/folder-depth.mjs';
import { CLASSES_REPORT } from '../analysis/python-structure.mjs';

const SIZE_TOOL = 'structure';
const WORDING = {
  subject: 'Package',
  below: 'its top-level package',
  advice: (limit) =>
    `Keep packages at most ${String(limit)} levels below the top-level package: group by responsibility instead of nesting.`,
};
const INTERFACE_BASES = new Set(['object', 'ABC', 'Generic', 'Protocol']);

function packageDepth({ module, isPackage }) {
  const parts = module.split('.');
  const folders = isPackage ? parts : parts.slice(0, -1);
  return Math.max(0, folders.length - 1);
}

export function pythonFolderDepthFindings(modules, { thresholds = {}, exceptions }) {
  const depths = new Map(modules.map((entry) => [entry.file, packageDepth(entry)]));
  return folderDepthFindings(
    modules.map(({ file }) => ({ path: file, kind: 'source' })),
    {
      analyzerName: SIZE_TOOL,
      limit: thresholds.folderDepth ?? FOLDER_DEPTH_DEFAULTS.python,
      exceptions,
      wording: WORDING,
      depthOf: ({ path: file }) => depths.get(file),
    },
  );
}

function importedBase(entry, importer) {
  if (entry.name === undefined) {
    return entry.module;
  }
  if ((entry.level ?? 0) === 0) {
    return `${entry.module}.${entry.name}`;
  }
  const owner = importer.isPackage
    ? importer.module
    : importer.module.split('.').slice(0, -1).join('.');
  const parts = owner === '' ? [] : owner.split('.');
  const kept = parts.slice(0, Math.max(0, parts.length - (entry.level - 1)));
  return [...kept, ...(entry.module ?? '').split('.'), entry.name].filter(Boolean).join('.');
}

function aliasOf(entry, importer) {
  if (entry.name === undefined) {
    const top = entry.module.split('.')[0];
    return typeof entry.asname === 'string' ? [entry.asname, entry.module] : [top, top];
  }
  return [entry.asname ?? entry.name, importedBase(entry, importer)];
}

function aliases(imports, importer) {
  return new Map(imports.map((entry) => aliasOf(entry, importer)));
}

function resolver(report, modules) {
  const byFile = new Map(modules.map((entry) => [entry.file, entry]));
  const known = new Map();
  for (const [file, { classes }] of Object.entries(report)) {
    const module = byFile.get(file)?.module;
    for (const entry of module === undefined ? [] : classes)
      known.set(`${module}.${entry.name}`, entry);
  }
  const names = new Map(
    Object.entries(report).map(([file, { imports }]) => [
      file,
      byFile.has(file) ? aliases(imports, byFile.get(file)) : new Map(),
    ]),
  );
  return (entry, written) => {
    const [first, ...rest] = written.split('.');
    const module = byFile.get(entry.file)?.module;
    const imported = names.get(entry.file)?.get(first);
    const candidates = [
      ...(module === undefined ? [] : [`${module}.${written}`]),
      ...(imported === undefined ? [] : [[imported, ...rest].join('.')]),
    ];
    return candidates.map((name) => known.get(name)).find((found) => found !== undefined);
  };
}

function countedBases(entry) {
  return entry.bases.filter((written) => !INTERFACE_BASES.has(written.split('.').at(-1)));
}

function inheritanceDepth(entry, resolve, seen = new Set()) {
  const bases = countedBases(entry);
  if (bases.length === 0) {
    return 0;
  }
  const parents = bases
    .map((written) => resolve(entry, written))
    .filter((parent) => parent !== undefined && !seen.has(parent));
  const inherited = parents.map((parent) =>
    inheritanceDepth(parent, resolve, new Set([...seen, entry])),
  );
  return 1 + Math.max(0, ...inherited);
}

export function readClassesReport(reportRoot) {
  const report = path.join(reportRoot, CLASSES_REPORT);
  if (!existsSync(report)) {
    throw new Error(
      `The ${CLASSES_REPORT} report is missing from ${reportRoot}: the structure step did not write it, so the class limits cannot be checked`,
    );
  }
  return JSON.parse(readFileSync(report, 'utf8'));
}

export function pythonClassLimitFindings(report, modules, { thresholds, exceptions }) {
  const production = new Set(modules.map(({ file }) => file));
  const resolve = resolver(report, modules);
  const classes = Object.entries(report)
    .filter(([file]) => production.has(file))
    .flatMap(([, { classes: entries }]) => entries)
    .map((entry) => ({ ...entry, inheritanceDepth: inheritanceDepth(entry, resolve) }));
  return classLimitFindings(classes, { analyzerName: SIZE_TOOL, thresholds, exceptions });
}
