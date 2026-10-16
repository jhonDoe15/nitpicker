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

function compilerConfigurations(project) {
  const plugin = all(project, 'build', 'plugins', 'plugin').find(
    (candidate) => textAt(candidate, 'artifactId') === COMPILER,
  );
  const compileExecution = all(plugin, 'executions', 'execution').find(
    (execution) => textAt(execution, 'id') === 'default-compile',
  );
  return [child(compileExecution, 'configuration'), child(plugin, 'configuration')].filter(
    (configuration) => configuration !== undefined,
  );
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
    return configured ?? textAt(project, 'properties', property);
  };
}

export function compilerSettings(project) {
  const configurations = compilerConfigurations(project);
  const setting = settingOf(project, configurations);
  const compilerArgs = configurations
    .map((configuration) => all(configuration, 'compilerArgs', 'arg'))
    .find((args) => args.length > 0);
  return {
    release: setting('release', 'maven.compiler.release'),
    source: setting('source', 'maven.compiler.source'),
    target: setting('target', 'maven.compiler.target'),
    encoding:
      setting('encoding', 'maven.compiler.encoding') ??
      textAt(project, 'properties', 'project.build.sourceEncoding'),
    compilerArgs: (compilerArgs ?? [])
      .map((argument) => argument.text?.trim())
      .filter((argument) => argument !== undefined && argument !== ''),
    proc: setting('proc', 'maven.compiler.proc'),
    processorPaths: processorPaths(project, configurations),
  };
}
