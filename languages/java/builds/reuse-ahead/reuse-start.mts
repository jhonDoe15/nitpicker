import path from 'node:path';
import { readOptions } from '../../adapters/options/java-read-options.mts';
import { callUntyped, type JavaPolicy } from '../../adapters/typed/java-values.mts';
import { moduleSourceRoots } from '../../maven/manifest/maven-manifest.mts';
import { MAVEN_REPORT_DIRECTORY } from '../../maven/module/maven-module.mts';
import type { MavenModule } from '../../maven/typed/maven-values.mts';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import { isProjectRoot, moduleProjectOf } from '../java-modules.mts';
import { reportModuleProjects } from '../project-wide.mts';
import { startReuseAhead } from './reuse-ahead.mts';
import { reuseRequest } from './reuse-request.mts';

const KOTLIN = 'kotlin';

function startFor(projectRoot: string, projects: readonly unknown[], policy: JavaPolicy): void {
  const options = readOptions(policy);
  startReuseAhead(
    reuseRequest(projectRoot, { projects, kotlin: options['preset'] === KOTLIN, policy: options }),
  );
}

function plannedManifest(module: MavenModule): Readonly<Record<string, unknown>> {
  return { ...moduleSourceRoots(module), published: module['published'] === true };
}

function mavenProjects(projectRoot: string, modules: readonly MavenModule[]): unknown[] {
  const reportDirectory = MAVEN_REPORT_DIRECTORY;
  if (
    isProjectRoot(
      projectRoot,
      modules.map(({ basedir }) => basedir),
    )
  ) {
    return modules.flatMap((module) => {
      const manifest = plannedManifest(module);
      const reportRoot = path.join(projectRoot, reportDirectory);
      const report = { key: 'root', dir: '', reportRoot, manifest };
      return reportModuleProjects([report], 'root').map((project) => ({
        ...project,
        published: manifest['published'],
      }));
    });
  }
  return modules.map((module) =>
    moduleProjectOf(projectRoot, module.basedir, {
      reportDirectory,
      manifest: plannedManifest(module),
    }),
  );
}

export function startMavenReuse(
  projectRoot: string,
  modules: readonly MavenModule[],
  policy: JavaPolicy = {},
): void {
  startFor(projectRoot, mavenProjects(projectRoot, modules), policy);
}

export function startGradleReuse(
  projectRoot: string,
  report: unknown,
  policy: JavaPolicy = {},
): void {
  const modules = listOf(fieldOf(report, 'modules'));
  startFor(projectRoot, listOf(callUntyped(reportModuleProjects, modules, 'root')), policy);
}
