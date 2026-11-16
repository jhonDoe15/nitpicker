import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { projectWideReport } from '../../../builds/project-wide.mts';
import type { JavaFinding, JavaPolicy } from '../../typed/java-values.mts';

export type FeatureModule = {
  readonly qualifier?: string | undefined;
  readonly classes: readonly string[];
  readonly edges?: readonly (readonly [string, string])[] | undefined;
  readonly kotlinMetrics?: unknown;
  readonly springArch?: unknown;
};
type FeatureProjectEntry = {
  readonly reportRoot: string;
  readonly qualifier: string;
  readonly sourceRoots: string[];
  readonly kotlinSourceRoots: string[];
  readonly resourceRoots: string[];
  filePrefix?: string;
};
export type FeatureTestProject = {
  readonly root: string;
  readonly projects: FeatureProjectEntry[];
};
type FindingRow = { readonly rule: string; readonly path: string; readonly identity?: string };

function write(root: string, files: Readonly<Record<string, string>>): void {
  for (const [name, text] of Object.entries(files)) {
    const target = path.resolve(root, name);
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`${name} is outside the test project`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

function javaClass(qualifiedName: string): string {
  const index = qualifiedName.lastIndexOf('.');
  const name = qualifiedName.slice(index + 1);
  return `package ${qualifiedName.slice(0, index)};\n\npublic class ${name} {}\n`;
}

export function javaSources(
  names: readonly string[],
  root: string = 'src/main/java',
): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => [`${root}/${name.replaceAll('.', '/')}.java`, javaClass(name)]),
  );
}

function edgeLine([source, target]: readonly [string, string]): string {
  return `   ${source} -> ${target} classes\n`;
}

function reportFiles(module: FeatureModule): Record<string, string> {
  return {
    'jdeps-classes.txt': module.classes.map((name) => `${name}\n`).join(''),
    'jdeps.txt': (module.edges ?? []).map(edgeLine).join(''),
    'jdeps-test.txt': '',
    ...(module.kotlinMetrics === undefined
      ? {}
      : { 'kotlin-metrics.json': JSON.stringify(module.kotlinMetrics) }),
    ...(module.springArch === undefined
      ? {}
      : { 'spring-arch.json': JSON.stringify(module.springArch) }),
  };
}

function projectOf(root: string, module: FeatureModule): FeatureProjectEntry {
  const qualifier = module.qualifier ?? '';
  const prefix = qualifier === '' ? '' : `${qualifier}/`;
  const reportRoot = path.join(root, '.reports', qualifier || 'root');
  write(reportRoot, reportFiles(module));
  return {
    reportRoot,
    qualifier,
    sourceRoots: [`${prefix}src/main/java`],
    kotlinSourceRoots: [`${prefix}src/main/kotlin`],
    resourceRoots: [],
  };
}

export function featureProjects(): {
  project: (options: {
    files?: Readonly<Record<string, string>> | undefined;
    modules: readonly FeatureModule[];
  }) => FeatureTestProject;
  remove: () => void;
} {
  const temporaryRoots: string[] = [];

  function remove(): void {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function project({
    files = {},
    modules,
  }: {
    files?: Readonly<Record<string, string>> | undefined;
    modules: readonly FeatureModule[];
  }): FeatureTestProject {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-feature-graph-')));
    temporaryRoots.push(root);
    write(root, files);
    return { root, projects: modules.map((module) => projectOf(root, module)) };
  }

  return { project, remove };
}

export function rows(findings: readonly FindingRow[]): (string | undefined)[][] {
  return findings.map(({ rule, path: file, identity }) => [rule, file, identity]);
}

const GRAPH_RULES = new Set([
  'feature-internal-import',
  'shared-imports-feature',
  'feature-cycle',
  'shared-used-by-one-feature',
  'foreign-feature-persistence',
  'package-cycle',
]);

export function projectFindings(
  project: FeatureTestProject,
  { kotlin = false, policy = {} }: Partial<{ kotlin: boolean; policy: JavaPolicy }> = {},
): JavaFinding[] {
  const { findings } = projectWideReport(project.root, {
    projects: project.projects,
    mergedRoot: path.join(project.root, '.reports', 'merged'),
    manifest: { sourceRoots: project.projects[0]?.sourceRoots ?? [] },
    kotlin,
    policy,
  });
  return findings.filter(({ rule }) => GRAPH_RULES.has(rule) || rule.startsWith('domain-'));
}
