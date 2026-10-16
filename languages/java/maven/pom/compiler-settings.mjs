import { all, child, CONFIGURATION, PROPERTIES, textAt } from './pom-elements.mjs';

const COMPILER = 'org.apache.maven.plugins:maven-compiler-plugin';

function resolved(value) {
  return value === undefined || value.includes('${') ? undefined : value;
}

function compilerConfigurations(plugin) {
  const compile = all(plugin, 'executions', 'execution').find(
    (execution) => textAt(execution, 'id') === 'default-compile',
  );
  return [child(compile, CONFIGURATION), child(plugin, CONFIGURATION)];
}

function setting({ project, configurations }, name, property) {
  return [
    ...configurations.map((configuration) => textAt(configuration, name)),
    textAt(project, PROPERTIES, property),
  ]
    .map((value) => resolved(value))
    .find((value) => value !== undefined);
}

function compilerArgs(configurations) {
  const configuration = configurations.find(
    (candidate) => child(candidate, 'compilerArgs') !== undefined,
  );
  const argument = configurations
    .map((candidate) => textAt(candidate, 'compilerArgument'))
    .find(Boolean);
  return [
    ...all(configuration, 'compilerArgs', 'arg').flatMap((arg) => arg.text ?? []),
    ...(argument?.split(/\s+/u) ?? []),
  ];
}

export function compilerSettings(project, plugins) {
  const settings = { project, configurations: compilerConfigurations(plugins.get(COMPILER)) };
  return {
    release: setting(settings, 'release', 'maven.compiler.release'),
    source: setting(settings, 'source', 'maven.compiler.source'),
    target: setting(settings, 'target', 'maven.compiler.target'),
    encoding:
      setting(settings, 'encoding', 'maven.compiler.encoding') ??
      resolved(textAt(project, PROPERTIES, 'project.build.sourceEncoding')),
    args: [
      ...compilerArgs(settings.configurations),
      ...(setting(settings, 'enablePreview', 'maven.compiler.enablePreview') === 'true'
        ? ['--enable-preview']
        : []),
    ],
  };
}
