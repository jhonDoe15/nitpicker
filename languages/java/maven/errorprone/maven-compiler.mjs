import { childrenNamed } from '../../ingest/common.mjs';

const COMPILER = 'maven-compiler-plugin';
const UNRESOLVED = /\$\{/u;

function child(element, ...names) {
  return names.reduce((current, name) => current && childrenNamed(current, name)[0], element);
}

function textAt(element, ...names) {
  return child(element, ...names)?.text?.trim();
}

function all(element, ...names) {
  const parent = child(element, ...names.slice(0, -1));
  return parent === undefined ? [] : childrenNamed(parent, names.at(-1));
}

function compilerPlugin(project) {
  return all(project, 'build', 'plugins', 'plugin').find(
    (candidate) => textAt(candidate, 'artifactId') === COMPILER,
  );
}

function compilerConfigurations(plugin, executionId) {
  const execution = all(plugin, 'executions', 'execution').find(
    (candidate) => textAt(candidate, 'id') === executionId,
  );
  return [child(execution, 'configuration'), child(plugin, 'configuration')].filter(
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
      textAt(dependency, 'groupId') === groupId && textAt(dependency, 'artifactId') === artifactId,
  );
  return declared === undefined ? undefined : textAt(declared, 'version');
}

function processorCoordinates(project, entry) {
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
    const configured = configurations
      .map((configuration) => textAt(configuration, name))
      .find((value) => value !== undefined);
    const value = configured ?? textAt(project, 'properties', property);
    return value === '' ? undefined : value;
  };
}

function argumentsOf(configurations, setting) {
  const listed = configurations
    .map((configuration) => all(configuration, 'compilerArgs', 'arg'))
    .find((args) => args.length > 0);
  const single = configurations
    .map((configuration) => textAt(configuration, 'compilerArgument'))
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

export function compilerSettings(project) {
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
