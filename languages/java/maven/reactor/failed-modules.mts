import { existsSync } from 'node:fs';
import { compileErrorsOf } from '../../builds/compile-errors/compile-findings.mjs';
import { dependencyFile } from '../quick/maven-build-arguments.mts';
import { relativeTo } from '../module/module-paths.mts';
import { listOf } from '../../../../shared/values/readers.mts';
import type { MavenModule } from '../typed/maven-values.mts';
import type { JavaFinding } from '../../adapters/typed/java-values.mts';

export type FailedModule = { readonly module: MavenModule; readonly reason: string | undefined };

const FAILED_GOAL =
  /Failed to execute goal [\w.-]+:[\w.-]+:\S+ (?:\([^)\n]*\) )?on project (?<project>[\w.-]+):[^\n]*/gu;
const JAVA_BUILD_PLUGINS = new Set([
  'maven-compiler-plugin',
  'maven-surefire-plugin',
  'maven-failsafe-plugin',
  'maven-resources-plugin',
  'maven-dependency-plugin',
  'jacoco-maven-plugin',
  'kotlin-maven-plugin',
  'build-helper-maven-plugin',
]);
export const MODULE_BUILD_FAILED_RULE = 'module-build-failed';

function artifactIdOf(module: MavenModule): string {
  return module.coordinates.split(':')[1] ?? module.coordinates;
}

function failedGoals(message: string): Map<string, RegExpExecArray> {
  return new Map(
    [...message.matchAll(FAILED_GOAL)].map((match) => [match.groups?.['project'] ?? '', match]),
  );
}

export function failedModules(
  error: unknown,
  { work, modules }: { readonly work: string; readonly modules: readonly MavenModule[] },
): FailedModule[] | undefined {
  if (
    !(error instanceof Error) ||
    listOf(compileErrorsOf(error)).length > 0 ||
    'timedOut' in error
  ) {
    return undefined;
  }
  const unbuilt = modules.filter((module) => !existsSync(dependencyFile(work, module)));
  if (unbuilt.length === 0 || unbuilt.length === modules.length) {
    return undefined;
  }
  const goals = failedGoals(error.message);
  return unbuilt.map((module) => ({
    module,
    reason: goals.get(artifactIdOf(module))?.[0].replace(/\s*->\s*\[Help \d+\]\s*$/u, ''),
  }));
}

function hint(reason: string): string {
  const plugin = /Failed to execute goal [\w.-]+:(?<artifact>[\w.-]+)/u.exec(reason)?.groups?.[
    'artifact'
  ];
  return plugin === undefined || JAVA_BUILD_PLUGINS.has(plugin)
    ? ''
    : ` The failing step (${plugin}) does not build Java classes: add the module to "exclude" in ` +
        'nitpicker.config.json, or run nitpicker on the other modules, to check the rest without it.';
}

export function failedModuleFindings(
  failed: readonly FailedModule[],
  projectRoot: string,
): JavaFinding[] {
  const failedNames = failed
    .filter(({ reason }) => reason !== undefined)
    .map(({ module }) => artifactIdOf(module));
  return failed.map(({ module, reason }) => {
    const name = artifactIdOf(module);
    const cause =
      reason === undefined
        ? `it was not built because a module it depends on failed (${failedNames.join(', ') || 'see the Maven output'})`
        : `${reason.replace(/^\[ERROR\] /u, '')}.${hint(reason)}`;
    return {
      tool: 'maven',
      rule: MODULE_BUILD_FAILED_RULE,
      path: relativeTo(projectRoot, module.basedir) || '.',
      identity: `${MODULE_BUILD_FAILED_RULE}:${name}`,
      message: `Maven could not build module ${name}, so its checks did not run; the other modules were checked. Maven: ${cause}`,
      classification: 'tool-error',
    };
  });
}
