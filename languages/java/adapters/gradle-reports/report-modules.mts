import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { firstProjectFile, resolveInside } from '../../../../shared/conventions/read-inside.mjs';
import { fieldOf, fieldsOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type Manifest = Readonly<Record<string, unknown>>;
type ReportModule = Readonly<Record<string, unknown>> & {
  readonly key: string;
  readonly path: string;
  readonly dir: string;
  readonly reportRoot: string;
  readonly manifest: Manifest;
};
type ReportModules = { readonly modules: ReportModule[]; readonly manifest: Manifest };

const MODULES_FILE = 'modules.json';
const MANIFEST_FILE = 'manifest.json';
const JACOCO_FILE = 'jacoco.xml';
const MAIN_CLASSES_FILE = 'jdeps-classes.txt';
const CHECKSTYLE_FILE = 'checkstyle.xml';
const SOURCE_EXTENSIONS = ['.java', '.kt'];
const MODULE_IDENTITY_SEPARATOR = '@';
const ROOT_MODULE = 'root';
const KOTLIN_PLUGINS =
  'org.jetbrains.kotlin.jvm, org.jetbrains.kotlin.multiplatform or org.jetbrains.kotlin.android';
const EMPTY_JACOCO_REPORT = '<report name="no main classes"></report>';
const ROOT_LISTS = [
  'sourceRoots',
  'testSourceRoots',
  'resourceRoots',
  'kotlinSourceRoots',
  'kotlinTestSourceRoots',
];
const MERGED_LISTS = [...ROOT_LISTS, 'springClasspath'];

function readJson(file: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return parsed;
}

function moduleLabel(module: unknown): string {
  const projectPath = textOf(fieldOf(module, 'path'));
  const dir = fieldOf(module, 'dir');
  return dir === '' ? `project ${projectPath}` : `project ${projectPath} (${textOf(dir)})`;
}

function manifestOf(module: unknown): unknown {
  return fieldOf(module, 'manifest');
}

function listIn(module: unknown, list: string): string[] {
  return textsOf(fieldOf(manifestOf(module), list));
}

function flagged(modules: readonly unknown[], flag: string): boolean {
  return modules.some((module) => fieldOf(manifestOf(module), flag) === true);
}

function mergeManifests(modules: readonly ReportModule[]): Manifest {
  const declared = MERGED_LISTS.filter((list) =>
    modules.some(({ manifest }) => Array.isArray(manifest[list])),
  );
  return {
    ...Object.fromEntries(
      declared.map((list) => [
        list,
        [...new Set(modules.flatMap((module) => listIn(module, list)))],
      ]),
    ),
    kotlinExcludedFiles: modules.flatMap((module) => listIn(module, 'kotlinExcludedFiles')),
    spring: flagged(modules, 'spring'),
    kotlin: flagged(modules, 'kotlin'),
  };
}

export function withModuleIdentity(
  findings: readonly unknown[],
  module: unknown,
): readonly unknown[] {
  return fieldOf(module, 'key') === ROOT_MODULE
    ? findings
    : findings.map((finding) =>
        fieldOf(finding, 'path') === '.'
          ? {
              ...fieldsOf(finding),
              identity: `${textOf(fieldOf(finding, 'identity'))}${MODULE_IDENTITY_SEPARATOR}${textOf(fieldOf(module, 'path'))}`,
            }
          : finding,
      );
}

export function withoutExcludedFiles(
  findings: readonly unknown[],
  modules: readonly unknown[],
): readonly unknown[] {
  const excluded = new Set(modules.flatMap((module) => listIn(module, 'kotlinExcludedFiles')));
  return excluded.size === 0
    ? findings
    : findings.filter((finding) => !excluded.has(textOf(fieldOf(finding, 'path'))));
}

function readModule(reportBase: string, preset: string, entry: unknown): ReportModule {
  const key = textOf(fieldOf(entry, 'key'));
  const reportRoot = resolveInside(reportBase, key);
  const manifestFile = firstProjectFile(reportBase, [path.join(key, MANIFEST_FILE)]);
  if (reportRoot === undefined || manifestFile === undefined) {
    throw new Error(
      `The ${preset} preset found no Gradle reports for ${moduleLabel(entry)}: its nitpickerJava task did not run`,
    );
  }
  return {
    ...fieldsOf(entry),
    key,
    path: textOf(fieldOf(entry, 'path')),
    dir: textOf(fieldOf(entry, 'dir')),
    reportRoot,
    manifest: fieldsOf(readJson(path.join(reportBase, manifestFile))),
  };
}

export function readReportModules(reportBase: string, preset: string): ReportModules {
  const listFile = path.join(reportBase, MODULES_FILE);
  const listed = existsSync(listFile) ? listOf(readJson(listFile)) : [];
  if (listed.length === 0) {
    const plugin = preset === 'kotlin' ? KOTLIN_PLUGINS : 'java';
    throw new Error(
      `The ${preset} preset found no Gradle project that applies the ${plugin} plugin`,
    );
  }
  const modules = listed
    .toSorted((left, right) =>
      textOf(fieldOf(left, 'key')).localeCompare(textOf(fieldOf(right, 'key'))),
    )
    .map((entry) => readModule(reportBase, preset, entry));
  return { modules, manifest: mergeManifests(modules) };
}

function hasMainClasses(reportRoot: string): boolean {
  const file = path.join(reportRoot, MAIN_CLASSES_FILE);
  return existsSync(file) && readFileSync(file, 'utf8').trim() !== '';
}

function reportRootOf(module: unknown): string {
  return textOf(fieldOf(module, 'reportRoot'));
}

export function readModuleJacoco(module: unknown, preset: string): string | undefined {
  if (fieldOf(manifestOf(module), 'kotlinSourceModule') === true) {
    return undefined;
  }
  const file = path.join(reportRootOf(module), JACOCO_FILE);
  if (existsSync(file)) {
    return readFileSync(file, 'utf8');
  }
  if (!hasMainClasses(reportRootOf(module))) {
    return EMPTY_JACOCO_REPORT;
  }
  throw new Error(`The ${preset} preset found no JaCoCo report for ${moduleLabel(module)}`);
}

function hasSourceFiles(
  projectRoot: string,
  roots: readonly string[],
  extensions: readonly string[],
): boolean {
  return roots.some((root) => {
    const directory = root === '' || root === '.' ? projectRoot : resolveInside(projectRoot, root);
    return (
      directory !== undefined &&
      existsSync(directory) &&
      readdirSync(directory, { recursive: true, encoding: 'utf8' }).some((name) =>
        extensions.some((extension) => name.endsWith(extension)),
      )
    );
  });
}

export function isEmptyModule(projectRoot: string, module: unknown): boolean {
  const roots = ROOT_LISTS.flatMap((list) => listIn(module, list));
  return !(
    hasMainClasses(reportRootOf(module)) || hasSourceFiles(projectRoot, roots, SOURCE_EXTENSIONS)
  );
}

export function readMainCheckstyle(
  projectRoot: string,
  module: unknown,
  preset: string,
): string | undefined {
  const file = path.join(reportRootOf(module), CHECKSTYLE_FILE);
  if (existsSync(file)) {
    return readFileSync(file, 'utf8');
  }
  if (!hasSourceFiles(projectRoot, listIn(module, 'sourceRoots'), ['.java'])) {
    return undefined;
  }
  throw new Error(`The ${preset} preset found no Checkstyle report for ${moduleLabel(module)}`);
}
