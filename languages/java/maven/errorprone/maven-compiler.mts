import path from 'node:path';
import {
  type XmlElement,
  childAt,
  childrenAt,
  childrenNamed,
} from '../../../../shared/ingest/report-records.mts';
import { globsMatcher } from '../../../../shared/paths/glob.mts';
import type {
  CompilerExecution,
  CompilerLevel,
  CompilerPass,
  CompilerSettings,
} from './compiler-types.mts';
import { executionsOf, goalsOf, textAt } from '../configuration/pom-elements.mts';
import { javaFiles } from '../lint/java-files.mts';

const COMPILER = 'maven-compiler-plugin';
const PLACEHOLDER_OPEN = ['$', '{'].join('');

type Setting = (name: string, property: string) => string | undefined;
type GuardCompiler = CompilerLevel & {
  readonly encoding: string | undefined;
  readonly args: string[];
};
type PassContext = {
  readonly project: XmlElement;
  readonly pluginVersion: string | undefined;
  readonly test: boolean;
};

function compilerPlugin(project: XmlElement): XmlElement | undefined {
  return childrenAt(project, 'build', 'plugins', 'plugin').find(
    (candidate) => textAt(candidate, 'artifactId') === COMPILER,
  );
}

function executionConfigurations(
  plugin: XmlElement | undefined,
  execution: XmlElement | undefined,
): XmlElement[] {
  return [childAt(execution, 'configuration'), childAt(plugin, 'configuration')].filter(
    (configuration) => configuration !== undefined,
  );
}

function compilerConfigurations(plugin: XmlElement | undefined, executionId: string): XmlElement[] {
  const execution = executionsOf(plugin).find(
    (candidate) => textAt(candidate, 'id') === executionId,
  );
  return executionConfigurations(plugin, execution);
}

function defaultLevel(pluginVersion: string | undefined): string | undefined {
  const major = Number((pluginVersion ?? '3').split('.')[0]);
  return major >= 4 ? undefined : '8';
}

function managedVersion(
  project: XmlElement,
  groupId: string | undefined,
  artifactId: string | undefined,
): string | undefined {
  const declared = childrenAt(project, 'dependencyManagement', 'dependencies', 'dependency').find(
    (dependency) =>
      textAt(dependency, 'groupId') === groupId && textAt(dependency, 'artifactId') === artifactId,
  );
  return declared === undefined ? undefined : textAt(declared, 'version');
}

function processorCoordinates(project: XmlElement, entry: XmlElement): string {
  const groupId = textAt(entry, 'groupId');
  const artifactId = textAt(entry, 'artifactId');
  const version = textAt(entry, 'version') ?? managedVersion(project, groupId, artifactId);
  if (version === undefined || version === '' || version.includes(PLACEHOLDER_OPEN)) {
    const found = version === undefined ? 'no <version> and none in dependencyManagement' : version;
    throw new Error(
      `maven-compiler-plugin's annotationProcessorPaths names ${String(groupId)}:${String(artifactId)} without a ` +
        `version the effective POM resolves (${found}). Give the path a <version>, or manage ` +
        'the artifact in dependencyManagement',
    );
  }
  const classifier = textAt(entry, 'classifier');
  return [groupId, artifactId, version, ...(classifier === undefined ? [] : [classifier])].join(
    ':',
  );
}

function processorPaths(
  project: XmlElement,
  configurations: readonly XmlElement[],
): string[] | undefined {
  const paths = configurations
    .map((configuration) => childAt(configuration, 'annotationProcessorPaths'))
    .find((element) => element !== undefined);
  return paths === undefined
    ? undefined
    : childrenNamed(paths, 'path').map((entry) => processorCoordinates(project, entry));
}

function settingOf(project: XmlElement, configurations: readonly XmlElement[]): Setting {
  return function setting(name: string, property: string): string | undefined {
    return [
      ...configurations.map((configuration) => textAt(configuration, name)),
      textAt(project, 'properties', property),
    ].find((value) => value !== undefined && value !== '' && !value.includes(PLACEHOLDER_OPEN));
  };
}

function isArgument(argument: string | undefined): argument is string {
  return argument !== undefined && argument !== '';
}

function argumentsOf(configurations: readonly XmlElement[], setting: Setting): string[] {
  const listed = configurations
    .map((configuration) => childrenAt(configuration, 'compilerArgs', 'arg'))
    .find((args) => args.length > 0);
  const single = configurations
    .map((configuration) => textAt(configuration, 'compilerArgument'))
    .find((value) => value !== undefined);
  const preview = setting('enablePreview', 'maven.compiler.enablePreview') === 'true';
  const args = [
    ...(listed ?? []).map((argument) => argument.text?.trim()),
    ...(single ?? '').split(/\s+/u),
  ].filter(isArgument);
  return preview && !args.includes('--enable-preview') ? [...args, '--enable-preview'] : args;
}

function patternTexts(element: XmlElement): string[] {
  return element.children
    .map((child) => child.text?.trim())
    .filter(
      (value): value is string =>
        value !== undefined && value !== '' && !value.includes(PLACEHOLDER_OPEN),
    );
}

function patternsOf(configurations: readonly XmlElement[], name: string): string[] {
  const [current, ...rest] = configurations;
  if (current === undefined) {
    return [];
  }
  const element = childAt(current, name);
  if (element === undefined) {
    return patternsOf(rest, name);
  }
  const own = patternTexts(element);
  if (element.attrs['combine.self'] === 'override') {
    return own;
  }
  if (element.attrs['combine.children'] === 'append') {
    return [...patternsOf(rest, name), ...own];
  }
  return own.length > 0 ? own : patternsOf(rest, name);
}

function levelSetting(setting: Setting, test: boolean, name: string): string | undefined {
  const testName = `test${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;
  return (
    (test ? setting(testName, `maven.compiler.${testName}`) : undefined) ??
    setting(name, `maven.compiler.${name}`)
  );
}

function levelOf(
  setting: Setting,
  test: boolean,
  pluginVersion: string | undefined,
): CompilerLevel {
  const configured = {
    release: levelSetting(setting, test, 'release'),
    source: levelSetting(setting, test, 'source'),
    target: levelSetting(setting, test, 'target'),
  };
  if (Object.values(configured).some((value) => value !== undefined)) {
    return configured;
  }
  const fallback = defaultLevel(pluginVersion);
  return { release: undefined, source: fallback, target: fallback };
}

function passOf(
  configurations: readonly XmlElement[],
  { project, pluginVersion, test }: PassContext,
): CompilerPass {
  const setting = settingOf(project, configurations);
  const includes = patternsOf(configurations, test ? 'testIncludes' : 'includes');
  const excludes = patternsOf(configurations, test ? 'testExcludes' : 'excludes');
  return {
    ...levelOf(setting, test, pluginVersion),
    compilerArgs: argumentsOf(configurations, setting),
    ...(includes.length === 0 ? {} : { includes }),
    ...(excludes.length === 0 ? {} : { excludes }),
  };
}

function extraExecutions(
  plugin: XmlElement | undefined,
  context: Omit<PassContext, 'test'>,
): CompilerExecution[] {
  return executionsOf(plugin).flatMap((execution) => {
    if (textAt(execution, 'phase') === 'none') {
      return [];
    }
    const id = textAt(execution, 'id') ?? '';
    const goals = goalsOf(execution);
    const configs = executionConfigurations(plugin, execution);
    return [
      ...(goals.includes('compile') && id !== 'default-compile'
        ? [{ id, test: false, ...passOf(configs, { ...context, test: false }) }]
        : []),
      ...(goals.includes('testCompile') && id !== 'default-testCompile'
        ? [{ id, test: true, ...passOf(configs, { ...context, test: true }) }]
        : []),
    ];
  });
}

function normalizePattern(pattern: string): string {
  const normalized = pattern.replaceAll('\\', '/').replace(/^\/+/u, '');
  return normalized.endsWith('/') ? `${normalized}**` : normalized;
}

function patternPredicate({
  includes = [],
  excludes = [],
}: Pick<CompilerPass, 'includes' | 'excludes'>): (relative: string) => boolean {
  const include = includes.length === 0 ? undefined : globsMatcher(includes.map(normalizePattern));
  const exclude = excludes.length === 0 ? undefined : globsMatcher(excludes.map(normalizePattern));
  return (relative) =>
    (include === undefined || include(relative)) && (exclude === undefined || !exclude(relative));
}

export function matchingSources(
  roots: readonly string[],
  pass: Pick<CompilerPass, 'includes' | 'excludes'>,
): string[] {
  const matches = patternPredicate(pass);
  return roots
    .flatMap((root) =>
      javaFiles([root]).filter((file) => matches(path.relative(root, file).replaceAll('\\', '/'))),
    )
    .sort();
}

export function levelLines(compiler: CompilerLevel): string[] {
  if (compiler.release !== undefined) {
    return [`--release=${compiler.release}`];
  }
  return [
    ...(compiler.source === undefined ? [] : [`--source=${compiler.source}`]),
    ...(compiler.target === undefined ? [] : [`--target=${compiler.target}`]),
  ];
}

export function usesPreview(compiler: CompilerSettings): boolean {
  return [compiler, compiler.test, ...(compiler.executions ?? [])].some(
    (settings) => settings?.compilerArgs.includes('--enable-preview') === true,
  );
}

export function executionName(execution: CompilerExecution, index: number): string {
  const prefix = execution.test ? 'test' : 'main';
  const safe = execution.id.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return `${prefix}-${safe === '' ? String(index) : safe}`;
}

export function compilerSettings(project: XmlElement): CompilerSettings {
  const plugin = compilerPlugin(project);
  const pluginVersion = textAt(plugin, 'version');
  const configurations = compilerConfigurations(plugin, 'default-compile');
  const setting = settingOf(project, configurations);
  const testConfigurations = compilerConfigurations(plugin, 'default-testCompile');
  const context = { project, pluginVersion };
  const executions = extraExecutions(plugin, context);
  return {
    ...passOf(configurations, { ...context, test: false }),
    encoding:
      setting('encoding', 'maven.compiler.encoding') ??
      textAt(project, 'properties', 'project.build.sourceEncoding'),
    proc: setting('proc', 'maven.compiler.proc'),
    processorPaths: processorPaths(project, configurations),
    test: passOf(testConfigurations, { ...context, test: true }),
    ...(executions.length === 0 ? {} : { executions }),
  };
}

export function guardCompiler({
  release,
  source,
  target,
  encoding,
  compilerArgs,
}: CompilerSettings): GuardCompiler {
  return { release, source, target, encoding, args: compilerArgs };
}
