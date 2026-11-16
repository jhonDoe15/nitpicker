import {
  type XmlElement,
  childAt,
  childrenAt,
  childrenNamed,
} from '../../../../shared/values/xml.mts';
import type { CompilerLevel, CompilerSettings } from './compiler-types.mts';
import { textAt } from '../configuration/pom-elements.mts';

const COMPILER = 'maven-compiler-plugin';
const UNRESOLVED = /\$\{/u;

type Setting = (name: string, property: string) => string | undefined;
type GuardCompiler = CompilerLevel & {
  readonly encoding: string | undefined;
  readonly args: string[];
};

function compilerPlugin(project: XmlElement): XmlElement | undefined {
  return childrenAt(project, 'build', 'plugins', 'plugin').find(
    (candidate) => textAt(candidate, 'artifactId') === COMPILER,
  );
}

function compilerConfigurations(plugin: XmlElement | undefined, executionId: string): XmlElement[] {
  const execution = childrenAt(plugin, 'executions', 'execution').find(
    (candidate) => textAt(candidate, 'id') === executionId,
  );
  return [childAt(execution, 'configuration'), childAt(plugin, 'configuration')].filter(
    (configuration) => configuration !== undefined,
  );
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
  if (version === undefined || version === '' || UNRESOLVED.test(version)) {
    const found = version === undefined ? 'no <version> and none in dependencyManagement' : version;
    throw new Error(
      `maven-compiler-plugin's annotationProcessorPaths names ${groupId}:${artifactId} without a ` +
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
    ].find((value) => value !== undefined && value !== '' && !UNRESOLVED.test(value));
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

export function compilerSettings(project: XmlElement): CompilerSettings {
  const plugin = compilerPlugin(project);
  const pluginVersion = textAt(plugin, 'version');
  const configurations = compilerConfigurations(plugin, 'default-compile');
  const setting = settingOf(project, configurations);
  const testConfigurations = compilerConfigurations(plugin, 'default-testCompile');
  const testSetting = settingOf(project, testConfigurations);
  return {
    ...levelOf(setting, false, pluginVersion),
    encoding:
      setting('encoding', 'maven.compiler.encoding') ??
      textAt(project, 'properties', 'project.build.sourceEncoding'),
    compilerArgs: argumentsOf(configurations, setting),
    proc: setting('proc', 'maven.compiler.proc'),
    processorPaths: processorPaths(project, configurations),
    test: {
      ...levelOf(testSetting, true, pluginVersion),
      compilerArgs: argumentsOf(testConfigurations, testSetting),
    },
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
