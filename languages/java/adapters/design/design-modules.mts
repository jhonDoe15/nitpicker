import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { moduleProject } from '../../builds/java-modules.mjs';
import { MAVEN_REPORT_DIRECTORY } from '../../maven/module/maven-module.mjs';
import { resolveInside } from '../../../../shared/conventions/read-inside.mjs';
import { DESIGN_FACTS_FILE, designFindings } from './design-findings.mts';
import type { DesignModule } from './producer/design-facts.mts';
import type { JavaFinding, JavaPolicy } from '../typed/java-values.mts';
import type { JavaRunOptions } from '../typed/java-run-options.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type GradleDesignRun = {
  readonly projectRoot: string;
  readonly report: unknown;
  readonly options: JavaRunOptions;
  readonly reportBase: string;
};

export function gradleDesignModules(report: unknown): DesignModule[] {
  return listOf(fieldOf(report, 'modules')).map((module) => {
    const manifest = fieldOf(module, 'manifest');
    return {
      dir: textOf(fieldOf(module, 'dir')),
      sourceRoots: textsOf(fieldOf(manifest, 'sourceRoots')),
      published: fieldOf(manifest, 'published') === true,
      sourceJava: fieldOf(manifest, 'sourceJava'),
    };
  });
}

export function mavenDesignModules(
  projectRoot: string,
  moduleDirs: readonly string[],
  reportDirectory: string,
): DesignModule[] {
  return moduleDirs.map((moduleDir) => {
    const manifest = resolveInside(moduleDir, `${reportDirectory}/manifest.json`);
    if (manifest === undefined || !existsSync(manifest)) {
      const name = path.relative(projectRoot, moduleDir).replaceAll('\\', '/') || '.';
      throw new Error(`The design rules found no manifest.json for the Maven module ${name}`);
    }
    const project: unknown = moduleProject(projectRoot, moduleDir, { reportDirectory });
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    return {
      dir: textOf(fieldOf(project, 'qualifier')),
      sourceRoots: textsOf(fieldOf(project, 'sourceRoots')),
      published: fieldOf(project, 'published') === true,
      sourceJava: fieldOf(parsed, 'sourceJava'),
    };
  });
}

export function gradleDesignFindings({
  projectRoot,
  report,
  options,
  reportBase,
}: GradleDesignRun): JavaFinding[] {
  return designFindings({
    projectRoot,
    listModules: () => gradleDesignModules(report),
    policy: options.policy,
    analyzerName: options.policy?.preset ?? 'java',
    output: path.join(reportBase, DESIGN_FACTS_FILE),
  });
}

export function mavenDesignFindings(
  projectRoot: string,
  moduleDirs: readonly string[],
  policy: JavaPolicy | undefined,
): JavaFinding[] {
  return designFindings({
    projectRoot,
    listModules: () => mavenDesignModules(projectRoot, moduleDirs, MAVEN_REPORT_DIRECTORY),
    policy,
    analyzerName: policy?.preset ?? 'java',
    output: path.join(projectRoot, MAVEN_REPORT_DIRECTORY, DESIGN_FACTS_FILE),
  });
}
