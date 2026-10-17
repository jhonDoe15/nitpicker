import { childrenNamed } from '../../ingest/common.mjs';
import { all, child, CONFIGURATION, pluginsOf, PROPERTIES } from './pom-elements.mjs';

const COMPILER = 'org.apache.maven.plugins:maven-compiler-plugin';
const UNRESOLVED = /\$\{/u;

function trimmedText(element, ...names) {
  return child(element, ...names)?.text?.trim();
}

function resolved(value) {
  return value === undefined || value === '' || UNRESOLVED.test(value) ? undefined : value;
}

function compilerConfigurations(plugin, executionId) {
  const execution = all(plugin, 'executions', 'execution').find(
    (candidate) => trimmedText(candidate, 'id') === executionId,
  );
  return [child(execution, CONFIGURATION), child(plugin, CONFIGURATION)].filter(
    (configuration) => configuration !== undefined,
  );
}

function defaultLevel(pluginVersion) {
  const major = Number((pluginVersion ?? '3').split('.')[0]);
  return major >= 4 ? undefined : '8';
}

function managedVersion(project, groupId, artifactId) {
  const declared = all(project, 'dependencyManagement', 'dependencies', 'dependency').find(
    (dependency) =>
      trimmedText(dependency, 'groupId') === groupId &&
      trimmedText(dependency, 'artifactId') === artifactId,
  );
  return declared === undefined ? undefined : trimmedText(declared, 'version');
}

function processorCoordinates(project, entry) {
  const groupId = trimmedText(entry, 'groupId');
  const artifactId = trimmedText(entry, 'artifactId');
  const version = trimmedText(entry, 'version') ?? managedVersion(project, groupId, artifactId);
  if (version === undefined || version === '' || UNRESOLVED.test(version)) {
    const found = version === undefined ? 'no <version> and none in dependencyManagement' : version;
    throw new Error(
      `maven-compiler-plugin's annotationProcessorPaths names ${groupId}:${artifactId} without a ` +
        `version the effective POM resolves (${found}). Give the path a <version>, or manage ` +
        'the artifact in dependencyManagement',
    );
  }
  const classifier = trimmedText(entry, 'classifier');
  return [groupId, artifactId, version, ...(classifier === undefined ? [] : [classifier])].join(
    ':',
  );
}

function processorPaths(project, configurations) {
  const paths = configurations
    .map((configuration) => child(configuration, 'annotationProcessorPaths'))
    .find((element) => element !== undefined);
  return paths === undefined
    ? undefined
    : childrenNamed(paths, 'path').map((entry) => processorCoordinates(project, entry));
}

function settingOf(project, configurations) {
  return function setting(name, property) {
    return [
      ...configurations.map((configuration) => trimmedText(configuration, name)),
      trimmedText(project, PROPERTIES, property),
    ]
      .map((value) => resolved(value))
      .find((value) => value !== undefined);
  };
}

function argumentsOf(configurations, setting) {
  const listed = configurations
    .map((configuration) => all(configuration, 'compilerArgs', 'arg'))
    .find((args) => args.length > 0);
  const single = configurations
    .map((configuration) => trimmedText(configuration, 'compilerArgument'))
    .find((value) => value !== undefined);
  const preview = setting('enablePreview', 'maven.compiler.enablePreview') === 'true';
  const args = [
    ...(listed ?? []).map((argument) => argument.text?.trim()),
    ...(single ?? '').split(/\s+/u),
  ].filter((argument) => argument !== undefined && argument !== '');
  return preview && !args.includes('--enable-preview') ? [...args, '--enable-preview'] : args;
}

function levelSetting(setting, test, name) {
  const testName = `test${name[0].toUpperCase()}${name.slice(1)}`;
  return (
    (test ? setting(testName, `maven.compiler.${testName}`) : undefined) ??
    setting(name, `maven.compiler.${name}`)
  );
}

function levelOf(setting, test, pluginVersion) {
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

export function compilerSettings(project, plugins = pluginsOf(project)) {
  const plugin = plugins.get(COMPILER);
  const pluginVersion = trimmedText(plugin, 'version');
  const configurations = compilerConfigurations(plugin, 'default-compile');
  const setting = settingOf(project, configurations);
  const testConfigurations = compilerConfigurations(plugin, 'default-testCompile');
  const testSetting = settingOf(project, testConfigurations);
  return {
    ...levelOf(setting, false, pluginVersion),
    encoding:
      setting('encoding', 'maven.compiler.encoding') ??
      resolved(trimmedText(project, PROPERTIES, 'project.build.sourceEncoding')),
    args: argumentsOf(configurations, setting),
    proc: setting('proc', 'maven.compiler.proc'),
    processorPaths: processorPaths(project, configurations),
    test: {
      ...levelOf(testSetting, true, pluginVersion),
      args: argumentsOf(testConfigurations, testSetting),
    },
  };
}

export function guardCompiler({ release, source, target, encoding, args }) {
  return { release, source, target, encoding, args };
}
