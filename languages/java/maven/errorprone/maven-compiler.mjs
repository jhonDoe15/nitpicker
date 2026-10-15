import { childrenNamed } from '../../ingest/common.mjs';

const COMPILER = 'maven-compiler-plugin';

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

function compilerConfiguration(project) {
  const plugin = all(project, 'build', 'plugins', 'plugin').find(
    (candidate) => textAt(candidate, 'artifactId') === COMPILER,
  );
  return child(plugin, 'configuration');
}

function managedVersion(project, groupId, artifactId) {
  const declared = [
    ...all(project, 'dependencyManagement', 'dependencies', 'dependency'),
    ...all(project, 'dependencies', 'dependency'),
  ].find(
    (dependency) =>
      textAt(dependency, 'groupId') === groupId && textAt(dependency, 'artifactId') === artifactId,
  );
  return declared === undefined ? undefined : textAt(declared, 'version');
}

function processorPaths(project, configuration) {
  const paths = child(configuration, 'annotationProcessorPaths');
  if (paths === undefined) {
    return undefined;
  }
  return childrenNamed(paths, 'path').map((entry) => {
    const groupId = textAt(entry, 'groupId');
    const artifactId = textAt(entry, 'artifactId');
    const version = textAt(entry, 'version') ?? managedVersion(project, groupId, artifactId);
    const classifier = textAt(entry, 'classifier');
    return [groupId, artifactId, version, ...(classifier === undefined ? [] : [classifier])].join(
      ':',
    );
  });
}

function settingOf(project, configuration) {
  return function setting(name, property) {
    return textAt(configuration, name) ?? textAt(project, 'properties', property);
  };
}

export function compilerSettings(project) {
  const configuration = compilerConfiguration(project);
  const setting = settingOf(project, configuration);
  return {
    release:
      setting('release', 'maven.compiler.release') ??
      setting('target', 'maven.compiler.target') ??
      setting('source', 'maven.compiler.source'),
    encoding:
      setting('encoding', 'maven.compiler.encoding') ??
      textAt(project, 'properties', 'project.build.sourceEncoding'),
    compilerArgs: all(configuration, 'compilerArgs', 'arg')
      .map((argument) => argument.text?.trim())
      .filter((argument) => argument !== undefined && argument !== ''),
    proc: setting('proc', 'maven.compiler.proc'),
    processorPaths: processorPaths(project, configuration),
  };
}
