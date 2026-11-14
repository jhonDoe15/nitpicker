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
} from '../../../maven/maven-build.mjs';
import { runMaven } from '../../../maven/maven-command.mjs';
import { readReactor } from '../../../maven/maven-project.mjs';
import { resolveToolSet, toolDependencies } from '../../../maven/maven-tools.mjs';
import { patchFlags } from './gradle-patch.mjs';

function classpathsOf(work, module) {
  const dependencies = parseDependencyList(readFileSync(dependencyFile(work, module), 'utf8'));
  return { ...moduleClasspaths(module, dependencies), dependencies };
}

function compileProject({ projectRoot, maven, spawn, work }) {
  runMaven({
    projectRoot,
    maven,
    spawn,
    args: ['--quiet', 'test-compile', ...dependencyListArguments(work), ...PROJECT_CHECKS_OFF],
  });
}

function toolsFor({ projectRoot, maven, spawn, modules }) {
  const extraTools = modules.map((module) => processorTool(module.compiler)).filter(Boolean);
  const all = toolDependencies(readPinnedTools(), [], extraTools);
  const wanted = ['errorprone', ...extraTools.map(({ name }) => name)];
  return resolveToolSet({
    projectRoot,
    maven,
    spawn,
    tools: Object.fromEntries(wanted.map((name) => [name, all[name]])),
  });
}

export function runMavenPatch({
  projectRoot,
  environment = {},
  executeFixCommand,
  work,
  flags,
  checks,
}) {
  const maven = environment.NITPICKER_MAVEN || undefined;
  const spawn = fixSpawn({ operation: 'error-prone-patch', executeFixCommand });
  const patchRoot = path.join(work, 'patches');
  const reportRoot = path.join(work, 'reports');
  mkdirSync(patchRoot, { recursive: true });
  const effectivePom = readEffectivePom({ projectRoot, maven, work, spawn });
  const modules = readReactor(projectRoot, effectivePom).filter(
    ({ packaging }) => packaging !== 'pom',
  );
  compileProject({ projectRoot, maven, spawn, work });
  const tools = toolsFor({ projectRoot, maven, spawn, modules });
  mkdirSync(reportRoot, { recursive: true });
  const configs = { errorprone: { arguments: [...flags, ...patchFlags({ checks, patchRoot })] } };
  for (const module of modules) {
    runErrorProne({
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
