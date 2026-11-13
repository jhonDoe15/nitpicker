import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readJavaFindings } from '../adapters/reporting/java-reports.mts';
import { readProjectDuplicateFindings } from '../adapters/kotlin/kotlin-duplicates.mjs';
import { retargetSentence } from '../../../shared/messages/exception-sentence.mjs';
import { inModule } from './module-path.mjs';
import { projectWideReport } from './project-wide.mjs';
import { resolveInside } from '../../../shared/conventions/read-inside.mjs';
import { fieldOf, fieldsOf, textOf, textsOf } from '../../../shared/values/readers.mts';
import {
  type JavaFinding,
  callUntyped,
  findingsOf,
  optionalText,
} from '../adapters/typed/java-values.mts';

type ModuleRoots = Readonly<Record<string, string[]>>;
type ReportOptions = Readonly<Record<string, unknown>> & { readonly reportDirectory: string };
type ModuleFindings = { readonly findings: JavaFinding[]; readonly imports: unknown };
export type ModuleProject = {
  readonly reportRoot: string;
  readonly qualifier: string;
  readonly filePrefix: string;
  readonly sourceRoots: string[];
  readonly kotlinSourceRoots: string[];
  readonly testSourceRoots: string[];
  readonly kotlinTestSourceRoots: string[];
  readonly resourceRoots: string[];
  readonly published: boolean;
};

const MODULE_ROOT_LISTS = [
  'sourceRoots',
  'testSourceRoots',
  'kotlinSourceRoots',
  'kotlinTestSourceRoots',
];

function prefixOf(projectRoot: string, moduleDir: string): string {
  return path.relative(projectRoot, moduleDir).replaceAll('\\', '/');
}

function inModulePath(prefix: string, relativePath: string): string {
  const joined: unknown = inModule(prefix, relativePath);
  return String(joined);
}

export function prefixedFinding(finding: JavaFinding, prefix: string): JavaFinding {
  const findingPath = inModulePath(prefix, finding.path);
  function retarget(text: string | undefined): string | undefined {
    return text === undefined ? text : textOf(retargetSentence(text, finding.path, findingPath));
  }
  const { ratchet } = finding;
  return {
    ...finding,
    path: findingPath,
    message: retarget(finding.message),
    ...(ratchet === undefined
      ? {}
      : {
          ratchet: {
            ...fieldsOf(ratchet),
            heldMessage: retarget(optionalText(fieldOf(ratchet, 'heldMessage'))),
            worseMessage: retarget(optionalText(fieldOf(ratchet, 'worseMessage'))),
          },
        }),
  };
}

function readManifest(moduleDir: string, reportDirectory: string): unknown {
  const manifest: unknown = resolveInside(moduleDir, `${reportDirectory}/manifest.json`);
  if (typeof manifest !== 'string') {
    throw new Error(`The Maven report directory ${reportDirectory} is outside ${moduleDir}`);
  }
  return JSON.parse(readFileSync(manifest, 'utf8'));
}

function prefixedRoots(manifest: unknown, list: string, prefix: string): string[] {
  return textsOf(fieldOf(manifest, list)).map((root) => inModulePath(prefix, root));
}

function moduleReport(
  moduleDir: string,
  reportDirectory: string,
): { readonly reportBase: string; readonly report: unknown } {
  const reportRoot = path.join(moduleDir, reportDirectory);
  const manifest = readManifest(moduleDir, reportDirectory);
  return {
    reportBase: reportRoot,
    report: { modules: [{ key: 'root', path: ':', dir: '', reportRoot, manifest }], manifest },
  };
}

function readModule(moduleDir: string, options: ReportOptions): ModuleFindings {
  const read: unknown = readJavaFindings(moduleDir, {
    ...options,
    requireKotlin: false,
    ...moduleReport(moduleDir, options.reportDirectory),
  });
  return { findings: findingsOf(fieldOf(read, 'findings')), imports: fieldOf(read, 'imports') };
}

export function mergedRoots(
  projectRoot: string,
  moduleDirs: readonly string[],
  reportDirectory: string,
): ModuleRoots {
  const manifests = moduleDirs.map((moduleDir) => ({
    prefix: prefixOf(projectRoot, moduleDir),
    manifest: readManifest(moduleDir, reportDirectory),
  }));
  return Object.fromEntries(
    MODULE_ROOT_LISTS.map((list) => [
      list,
      manifests.flatMap(({ prefix, manifest }) => prefixedRoots(manifest, list, prefix)),
    ]),
  );
}

export function moduleProject(
  projectRoot: string,
  moduleDir: string,
  { reportDirectory }: { readonly reportDirectory: string },
): ModuleProject {
  const prefix = prefixOf(projectRoot, moduleDir);
  const manifest = readManifest(moduleDir, reportDirectory);
  return {
    reportRoot: path.join(moduleDir, reportDirectory),
    qualifier: prefix,
    filePrefix: prefix,
    sourceRoots: prefixedRoots(manifest, 'sourceRoots', prefix),
    kotlinSourceRoots: prefixedRoots(manifest, 'kotlinSourceRoots', prefix),
    testSourceRoots: prefixedRoots(manifest, 'testSourceRoots', prefix),
    kotlinTestSourceRoots: prefixedRoots(manifest, 'kotlinTestSourceRoots', prefix),
    resourceRoots: prefixedRoots(manifest, 'resourceRoots', prefix),
    published: fieldOf(manifest, 'published') === true,
  };
}

export function readModuleFindings(
  projectRoot: string,
  moduleDirs: readonly string[],
  options: ReportOptions,
): JavaFinding[] {
  return readModuleReport(projectRoot, moduleDirs, options).findings;
}

function isProjectRoot(projectRoot: string, moduleDirs: readonly string[]): boolean {
  const [only] = moduleDirs;
  return (
    moduleDirs.length === 1 &&
    only !== undefined &&
    path.resolve(only) === path.resolve(projectRoot)
  );
}

export function readModuleReport(
  projectRoot: string,
  moduleDirs: readonly string[],
  options: ReportOptions,
): ModuleFindings {
  if (isProjectRoot(projectRoot, moduleDirs)) {
    return readModule(projectRoot, { ...options, modulePath: '' });
  }
  const moduleFindings = moduleDirs.flatMap((moduleDir) => {
    const prefix = prefixOf(projectRoot, moduleDir);
    return readModule(moduleDir, {
      ...options,
      projectWide: false,
      modulePath: prefix,
      reactorRoot: projectRoot,
    }).findings.map((finding) => prefixedFinding(finding, prefix));
  });
  const wide: unknown = projectWideReport(projectRoot, {
    projects: moduleDirs.map((moduleDir) => moduleProject(projectRoot, moduleDir, options)),
    mergedRoot: path.join(projectRoot, options.reportDirectory),
    manifest: mergedRoots(projectRoot, moduleDirs, options.reportDirectory),
    kotlin: options['preset'] === 'kotlin',
    policy: options,
  });
  const duplicates = callUntyped(
    readProjectDuplicateFindings,
    path.join(projectRoot, options.reportDirectory),
    { preset: options['preset'], projectRoot },
  );
  return {
    findings: [
      ...moduleFindings,
      ...findingsOf(duplicates),
      ...findingsOf(fieldOf(wide, 'findings')),
    ],
    imports: fieldOf(wide, 'imports'),
  };
}
