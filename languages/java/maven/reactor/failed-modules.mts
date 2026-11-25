import { existsSync } from 'node:fs';
import { compileErrorsOf } from '../../builds/compile-errors/compile-findings.mts';
import { dependencyFile } from '../quick/maven-build-arguments.mts';
import { relativeTo } from '../module/module-paths.mts';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import { MODULE_BUILD_FAILED_RULE as SHARED_MODULE_BUILD_FAILED_RULE } from '../../../../shared/rules/finding-parts.mts';
import type { MavenModule } from '../typed/maven-values.mts';
import type { JavaFinding } from '../../adapters/typed/java-values.mts';

export type FailedModule = {
  readonly module: MavenModule;
  readonly reason: string | undefined;
  readonly fallback?: string | undefined;
};

type FailedModulesRequest = {
  readonly work: string;
  readonly modules: readonly MavenModule[];
  readonly reactor?: readonly MavenModule[] | undefined;
};

const FAILED_GOAL =
  /Failed to execute goal (?:[\w.-]+:[\w.-]+:\S+ (?:\([^)\n]*\) )?)?on project (?<project>[\w.-]+):[^\n]*/u;
const MAVEN_FOOTER_LINES = [
  '$',
  '-> \\[Help \\d+\\]',
  '\\[Help \\d+\\]',
  'To see the full stack trace',
  'Re-run Maven using',
  'For more information about the errors',
  'After correcting the problems',
  'mvn <args> -rf',
];
const MAVEN_FOOTER = new RegExp(`^\\[ERROR\\]\\s*(?:${MAVEN_FOOTER_LINES.join('|')})`, 'u');
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
const MAX_DETAIL_LINES = 3;
const MAX_REASON_LENGTH = 600;
const MAX_NAMED_SKIPPED = 10;
export const MODULE_BUILD_FAILED_RULE: string = SHARED_MODULE_BUILD_FAILED_RULE;

function artifactIdOf(module: MavenModule): string {
  return module.coordinates.split(':')[1] ?? module.coordinates;
}

function modulePath(projectRoot: string, basedir: string): string {
  return basedir === '' ? '.' : relativeTo(projectRoot, basedir) || '.';
}

function truncateReason(text: string): string {
  const chars = Array.from(text);
  return chars.length > MAX_REASON_LENGTH
    ? `${chars.slice(0, MAX_REASON_LENGTH).join('')}...`
    : text;
}

function detailLinesAfter(lines: readonly string[], start: number): string[] {
  const details: string[] = [];
  for (let index = start; index < lines.length && details.length < MAX_DETAIL_LINES; index += 1) {
    const line = lines[index] ?? '';
    if (!line.startsWith('[ERROR]') || MAVEN_FOOTER.test(line) || FAILED_GOAL.test(line)) {
      break;
    }
    const cleaned = line.replace(/^\[ERROR\]\s*/u, '').trim();
    if (cleaned !== '') {
      details.push(cleaned);
    }
  }
  return details;
}

function failedGoals(output: string): Map<string, string> {
  const lines = output.split(/\r?\n/u);
  const goals = new Map<string, string>();
  for (let index = 0; index < lines.length; index += 1) {
    const match = FAILED_GOAL.exec(lines[index] ?? '');
    const project = match?.groups?.['project'];
    if (match === null || project === undefined || goals.has(project)) {
      continue;
    }
    const head = match[0].replace(/\s*->\s*\[Help \d+\]\s*$/u, '').trim();
    const details = detailLinesAfter(lines, index + 1);
    goals.set(project, truncateReason([head, ...details].join(' | ')));
  }
  return goals;
}

function fallbackSummary(output: string): string | undefined {
  const errors = output
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('[ERROR]') && !MAVEN_FOOTER.test(line))
    .map((line) => line.replace(/^\[ERROR\]\s*/u, '').trim())
    .filter((line) => line !== '')
    .slice(0, MAX_DETAIL_LINES + 1);
  return errors.length === 0 ? undefined : truncateReason(errors.join(' | '));
}

function rawOutputOf(error: Error): string {
  const output = fieldOf(error, 'output');
  return typeof output === 'string' ? output : error.message;
}

function syntheticModule(project: string): MavenModule {
  return { coordinates: project, packaging: 'jar', basedir: '', buildDirectory: '' };
}

function externalFailed(
  goals: ReadonlyMap<string, string>,
  unbuilt: readonly MavenModule[],
  known: readonly MavenModule[],
): FailedModule[] {
  const unbuiltNames = new Set(unbuilt.map(artifactIdOf));
  const byName = new Map(known.map((module) => [artifactIdOf(module), module]));
  return [...goals]
    .filter(([project]) => !unbuiltNames.has(project))
    .map(([project, reason]) => ({
      module: byName.get(project) ?? syntheticModule(project),
      reason,
    }));
}

export function failedModules(
  error: unknown,
  { work, modules, reactor = [] }: FailedModulesRequest,
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
  const output = rawOutputOf(error);
  const goals = failedGoals(output);
  const external = externalFailed(goals, unbuilt, [...modules, ...reactor]);
  const fallback = goals.size === 0 ? fallbackSummary(output) : undefined;
  const entries = unbuilt.map((module) => ({
    module,
    reason: goals.get(artifactIdOf(module)),
    ...(fallback === undefined ? {} : { fallback }),
  }));
  return [...external, ...entries];
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

function namedSkipped(skipped: readonly FailedModule[]): string {
  const names = skipped.slice(0, MAX_NAMED_SKIPPED).map(({ module }) => artifactIdOf(module));
  const more = skipped.length - names.length;
  return more > 0 ? `${names.join(', ')} and ${String(more)} more` : names.join(', ');
}

function skippedSummary(skipped: readonly FailedModule[], failedNames: readonly string[]): string {
  if (skipped.length === 0) {
    return '';
  }
  const noun = skipped.length === 1 ? 'dependent module was' : 'dependent modules were';
  return ` ${String(skipped.length)} ${noun} skipped because ${failedNames.join(', ')} failed: ${namedSkipped(skipped)}.`;
}

function rootCauseFinding(
  { module, reason }: FailedModule,
  projectRoot: string,
  skippedNote: string,
): JavaFinding {
  const name = artifactIdOf(module);
  const text = (reason ?? '').replace(/^\[ERROR\] /u, '');
  const cause = `${text}.${hint(text)}${skippedNote}`;
  return {
    tool: 'maven',
    rule: MODULE_BUILD_FAILED_RULE,
    path: modulePath(projectRoot, module.basedir),
    identity: `${MODULE_BUILD_FAILED_RULE}:${name}`,
    message: `Maven could not build module ${name}, so its checks did not run; the other modules were checked. Maven: ${cause}`,
    classification: 'tool-error',
  };
}

function skippedOnlyFinding(skipped: readonly FailedModule[], projectRoot: string): JavaFinding {
  const detail = skipped.find(({ fallback }) => fallback !== undefined)?.fallback;
  const only = skipped[0];
  if (skipped.length === 1 && only !== undefined) {
    const name = artifactIdOf(only.module);
    const cause =
      detail ?? 'it was not built because a module it depends on failed (see the Maven output)';
    return {
      tool: 'maven',
      rule: MODULE_BUILD_FAILED_RULE,
      path: modulePath(projectRoot, only.module.basedir),
      identity: `${MODULE_BUILD_FAILED_RULE}:${name}`,
      message: `Maven could not build module ${name}, so its checks did not run; the other modules were checked. Maven: ${cause}`,
      classification: 'tool-error',
    };
  }
  const suffix = detail === undefined ? '' : ` Maven: ${detail}`;
  return {
    tool: 'maven',
    rule: MODULE_BUILD_FAILED_RULE,
    path: '.',
    identity: `${MODULE_BUILD_FAILED_RULE}:skipped`,
    message:
      `Maven skipped ${String(skipped.length)} dependent modules because an upstream module failed ` +
      `(${namedSkipped(skipped)}); their checks did not run while the other modules were checked.${suffix}`,
    classification: 'tool-error',
  };
}

export function failedModuleFindings(
  failed: readonly FailedModule[],
  projectRoot: string,
): JavaFinding[] {
  const rootCauses = failed.filter(({ reason }) => reason !== undefined);
  const skipped = failed.filter(({ reason }) => reason === undefined);
  if (rootCauses.length === 0) {
    return skipped.length === 0 ? [] : [skippedOnlyFinding(skipped, projectRoot)];
  }
  const failedNames = rootCauses.map(({ module }) => artifactIdOf(module));
  const note = skippedSummary(skipped, failedNames);
  return rootCauses.map((entry, index) =>
    rootCauseFinding(entry, projectRoot, index === 0 ? note : ''),
  );
}
