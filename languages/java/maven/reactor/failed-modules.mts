import { existsSync } from 'node:fs';
import { compileErrorsOf } from '../../builds/compile-errors/compile-findings.mts';
import { dependencyFile } from '../quick/maven-build-arguments.mts';
import { relativeTo } from '../module/module-paths.mts';
import { listOf } from '../../../../shared/values/readers.mts';
import { MODULE_BUILD_FAILED_RULE as SHARED_MODULE_BUILD_FAILED_RULE } from '../../../../shared/rules/finding-parts.mts';
import type { MavenModule } from '../typed/maven-values.mts';
import type { JavaFinding } from '../../adapters/typed/java-values.mts';

export type FailedModule = {
  readonly module: MavenModule;
  readonly reason: string | undefined;
  readonly cause?: string | undefined;
};

const FAILED_GOAL =
  /Failed to execute goal (?:[\w.-]+:[\w.-]+:\S+ (?:\([^)\n]*\) )?)?on project (?<project>[\w.-]+):[^\n]*/gu;
const CAUSE_LINES = 5;
const LISTED_MODULES = 10;
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
export const MODULE_BUILD_FAILED_RULE: string = SHARED_MODULE_BUILD_FAILED_RULE;

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
  const names = new Set(unbuilt.map(artifactIdOf));
  const elsewhere = [...goals].filter(([project]) => !names.has(project));
  const placed = goals.size > elsewhere.length;
  const cause = placed
    ? ''
    : withoutHelp(
        (elsewhere.length > 0
          ? elsewhere.map(([, match]) => match[0])
          : error.message.split('\n').filter((line) => line.startsWith('[ERROR]'))
        )
          .slice(0, CAUSE_LINES)
          .join('\n'),
      );
  return unbuilt.map((module) => {
    const reason = goals.get(artifactIdOf(module))?.[0];
    return reason === undefined
      ? { module, reason, ...(cause === '' ? {} : { cause }) }
      : { module, reason: withoutHelp(reason) };
  });
}

function withoutHelp(text: string): string {
  return text.replaceAll(/\s*->\s*\[Help \d+\]\s*$/gmu, '');
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

function failedFinding(projectRoot: string, module: MavenModule, reason: string): JavaFinding {
  const name = artifactIdOf(module);
  return {
    tool: 'maven',
    rule: MODULE_BUILD_FAILED_RULE,
    path: relativeTo(projectRoot, module.basedir) || '.',
    identity: `${MODULE_BUILD_FAILED_RULE}:${name}`,
    message:
      `Maven could not build module ${name}, so its checks did not run; the other modules were checked. ` +
      `Maven: ${reason.replace(/^\[ERROR\] /u, '')}.${hint(reason)}`,
    classification: 'tool-error',
  };
}

function listed(names: readonly string[]): string {
  const more = names.length - LISTED_MODULES;
  return names.slice(0, LISTED_MODULES).join(', ') + (more > 0 ? ` and ${String(more)} more` : '');
}

function skippedFinding(
  skipped: readonly FailedModule[],
  failedNames: readonly string[],
): JavaFinding {
  const names = skipped.map(({ module }) => artifactIdOf(module));
  const causes = [
    ...new Set(skipped.map(({ cause }) => cause).filter((cause) => cause !== undefined)),
  ];
  const why =
    failedNames.length > 0
      ? `failed (${failedNames.join(', ')})`
      : `failed. Maven: ${causes.join('\n') || 'see the Maven output'}`;
  const one = names.length === 1;
  const skippedBecause = one
    ? 'It was skipped because a module it depends on'
    : 'They were skipped because a module they depend on';
  const count = one ? '1 module' : `${String(names.length)} modules`;
  return {
    tool: 'maven',
    rule: MODULE_BUILD_FAILED_RULE,
    path: '.',
    identity: `${MODULE_BUILD_FAILED_RULE}:dependents`,
    message:
      `Maven did not build ${count} (${listed(names)}), so ${one ? 'its' : 'their'} checks did not run; the other ` +
      `modules were checked. ${skippedBecause} ${why}`,
    classification: 'tool-error',
  };
}

export function failedModuleFindings(
  failed: readonly FailedModule[],
  projectRoot: string,
): JavaFinding[] {
  const failedNames = failed
    .filter(({ reason }) => reason !== undefined)
    .map(({ module }) => artifactIdOf(module));
  const skipped = failed.filter(({ reason }) => reason === undefined);
  return [
    ...failed.flatMap(({ module, reason }) =>
      reason === undefined ? [] : [failedFinding(projectRoot, module, reason)],
    ),
    ...(skipped.length === 0 ? [] : [skippedFinding(skipped, failedNames)]),
  ];
}
