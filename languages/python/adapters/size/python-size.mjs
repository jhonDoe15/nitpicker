import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { FOLDER_DEPTH_DEFAULTS } from '../../../../shared/project-rules/size-rules.mjs';
import { classLimitFindings } from '../../../../shared/rules/size/class-limits.mjs';
import { folderDepthFindings } from '../../../../shared/rules/size/folder-depth.mjs';
import { CLASSES_REPORT } from '../analysis/python-structure.mjs';

const SIZE_TOOL = 'structure';
const WORDING = {
  subject: 'Package',
  below: 'the root package',
  advice: (limit) =>
    `Keep packages at most ${String(limit)} levels below the root package: group by responsibility instead of nesting.`,
};
const TEST_FOLDERS = new Set(['tests', 'test']);
const UNCOUNTED_KINDS = new Set(['protocol', 'interface']);

function packageParts({ module, isPackage }, packages) {
  const parts = module.split('.');
  const folders = isPackage ? parts : parts.slice(0, -1);
  const namespaces = folders.findIndex((_, index) =>
    packages.has(folders.slice(0, index + 1).join('.')),
  );
  return namespaces === -1 ? folders : folders.slice(namespaces);
}

function productionParts(modules) {
  const packages = new Set(
    modules.filter(({ isPackage }) => isPackage).map(({ module }) => module),
  );
  return modules.map((entry) => packageParts(entry, packages));
}

function testParts({ file }, sourceRoots) {
  const inRoot = sourceRoots.find((root) => root !== '.' && file.startsWith(`${root}/`));
  const relative = inRoot === undefined ? file : file.slice(inRoot.length + 1);
  return path.posix
    .dirname(relative)
    .split('/')
    .filter((part) => part !== '.' && !TEST_FOLDERS.has(part));
}

function commonRoot(partsList) {
  const voting = partsList.filter((parts) => parts.length > 0);
  if (voting.length === 0) {
    return [];
  }
  const [first, ...others] = voting;
  const divergence = first.findIndex((part, index) =>
    others.some((other) => other[index] !== part),
  );
  return first.slice(0, divergence === -1 ? first.length : divergence);
}

function depthBelow(root, parts) {
  const underRoot = root.every((part, index) => parts[index] === part);
  return underRoot ? parts.length - root.length : parts.length;
}

export function pythonFolderDepthFindings(
  modules,
  { thresholds = {}, exceptions, tests = [], sourceRoots = [], rootModules = modules },
) {
  const root = commonRoot(productionParts(rootModules.length === 0 ? modules : rootModules));
  const production = productionParts(modules);
  const entries = [
    ...modules.map(({ file }, index) => ({ path: file, kind: 'source', parts: production[index] })),
    ...tests.map((entry) => ({
      path: entry.file,
      kind: 'test',
      parts: testParts(entry, sourceRoots),
    })),
  ];
  return folderDepthFindings(entries, {
    analyzerName: SIZE_TOOL,
    limit: thresholds.folderDepth ?? FOLDER_DEPTH_DEFAULTS.python,
    exceptions,
    wording: WORDING,
    depthOf: ({ parts }) => depthBelow(root, parts),
  });
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
    for (const entry of module === undefined ? [] : classes) {
      known.set(`${module}.${entry.name}`, entry);
    }
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

function depthWalker(resolve) {
  const depths = new Map();
  const walking = new Set();
  function depthOf(entry) {
    if (depths.has(entry)) {
      return depths.get(entry);
    }
    if (UNCOUNTED_KINDS.has(entry.kind)) {
      return 0;
    }
    walking.add(entry);
    const parents = entry.bases
      .map((written) => resolve(entry, written))
      .filter((parent) => parent !== undefined && !walking.has(parent))
      .filter((parent) => !UNCOUNTED_KINDS.has(parent.kind));
    const depth = Math.max(0, ...parents.map((parent) => 1 + depthOf(parent)));
    walking.delete(entry);
    depths.set(entry, depth);
    return depth;
  }
  return depthOf;
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
  const depthOf = depthWalker(resolver(report, modules));
  const classes = Object.entries(report)
    .filter(([file]) => production.has(file))
    .flatMap(([, { classes: entries }]) => entries)
    .map((entry) => ({ ...entry, inheritanceDepth: depthOf(entry) }));
  return classLimitFindings(classes, { analyzerName: SIZE_TOOL, thresholds, exceptions });
}
