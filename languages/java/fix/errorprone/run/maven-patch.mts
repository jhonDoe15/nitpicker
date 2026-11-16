import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fixSpawn } from '../../../../../core/fix/common/fix-command.mjs';
import { readPinnedTools } from '../../../builds/java-build.mjs';
import {
  moduleClasspaths,
  parseDependencyList,
} from '../../../maven/configuration/maven-classpaths.mjs';
import { readEffectivePom } from '../../../maven/configuration/effective-pom.mjs';
import { runErrorProne, processorTool } from '../../../maven/errorprone/maven-errorprone.mjs';
import {
  dependencyFile,
  dependencyListArguments,
  PROJECT_CHECKS_OFF,
} from '../../../maven/quick/maven-build-arguments.mjs';
import { runMaven } from '../../../maven/maven-command.mjs';
import { readReactor } from '../../../maven/maven-project.mjs';
import { resolveToolSet, toolDependencies } from '../../../maven/maven-tools.mjs';
import { callUntyped } from '../../../adapters/typed/java-values.mts';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { configuredTool } from '../../tools/tool-classpath.mts';
import { type PatchRoots, type PatchRun, patchFlags } from './gradle-patch.mts';

type MavenRun = {
  readonly projectRoot: string;
  readonly maven: string | undefined;
  readonly spawn: unknown;
  readonly work: string;
};

const projectChecksOff: readonly string[] = PROJECT_CHECKS_OFF;

function classpathsOf(work: string, module: unknown): object {
  const dependencies = callUntyped(
    parseDependencyList,
    readFileSync(textOf(callUntyped(dependencyFile, work, module)), 'utf8'),
  );
  return { ...fieldsOf(callUntyped(moduleClasspaths, module, dependencies)), dependencies };
}

function compileProject({ projectRoot, maven, spawn, work }: MavenRun): void {
  callUntyped(runMaven, {
    projectRoot,
    maven,
    spawn,
    args: [
      '--quiet',
      'test-compile',
      ...listOf(callUntyped(dependencyListArguments, work)),
      ...projectChecksOff,
    ],
  });
}

function toolsFor(run: MavenRun, modules: readonly unknown[]): unknown {
  const extraTools = modules
    .map((module) => callUntyped(processorTool, fieldOf(module, 'compiler')))
    .filter(Boolean);
  const all = callUntyped(toolDependencies, readPinnedTools(), [], extraTools);
  const wanted = ['errorprone', ...extraTools.map((tool) => textOf(fieldOf(tool, 'name')))];
  return callUntyped(resolveToolSet, {
    projectRoot: run.projectRoot,
    maven: run.maven,
    spawn: run.spawn,
    tools: Object.fromEntries(wanted.map((name) => [name, fieldOf(all, name)])),
  });
}

function reactorModules(run: MavenRun): unknown[] {
  const effectivePom = callUntyped(readEffectivePom, run);
  return listOf(callUntyped(readReactor, run.projectRoot, effectivePom)).filter(
    (module) => fieldOf(module, 'packaging') !== 'pom',
  );
}

export function runMavenPatch({
  projectRoot,
  environment = {},
  executeFixCommand,
  work,
  flags,
  checks,
}: PatchRun): PatchRoots {
  const spawn = callUntyped(fixSpawn, { operation: 'error-prone-patch', executeFixCommand });
  const run = { projectRoot, maven: configuredTool(environment, 'NITPICKER_MAVEN'), spawn, work };
  const patchRoot = path.join(work, 'patches');
  const reportRoot = path.join(work, 'reports');
  mkdirSync(patchRoot, { recursive: true });
  const modules = reactorModules(run);
  compileProject(run);
  const tools = toolsFor(run, modules);
  mkdirSync(reportRoot, { recursive: true });
  const configs = { errorprone: { arguments: [...flags, ...patchFlags({ checks, patchRoot })] } };
  for (const module of modules) {
    callUntyped(runErrorProne, {
      module,
      reportDir: mkdtempSync(`${reportRoot}${path.sep}module-`),
      tools,
      classpaths: classpathsOf(work, module),
      configs,
      spawn,
    });
  }
  return { patchRoot, reportRoot };
}
