import path from 'node:path';
import { childAt, childrenAt, parseXml } from '../../ingest/common.mjs';
import { excludeCovers } from './source-patterns.mjs';

const TEST_PLUGINS = new Set(['maven-surefire-plugin', 'maven-failsafe-plugin']);
const BASEDIR = /^\$\{(?:project\.)?basedir\}\/?/u;
const SKIP_SETTINGS = ['skip', 'skipTests', 'skipITs'];
const SKIP_PROPERTIES = ['skipTests', 'skipITs', 'maven.test.skip'];
const PLUGIN_LISTS = [
  ['build', 'plugins', 'plugin'],
  ['build', 'pluginManagement', 'plugins', 'plugin'],
];

function textsOf(element, ...names) {
  return childrenAt(element, ...names)
    .map((child) => child.text?.trim())
    .filter((text) => text !== undefined && text !== '');
}

function allPlugins(project) {
  const profiles = childrenAt(project, 'profiles', 'profile');
  return [project, ...profiles].flatMap((owner) =>
    PLUGIN_LISTS.flatMap((names) => childrenAt(owner, ...names)),
  );
}

function configurations(plugin) {
  return [
    childAt(plugin, 'configuration'),
    ...childrenAt(plugin, 'executions', 'execution').map((execution) =>
      childAt(execution, 'configuration'),
    ),
  ].filter((configuration) => configuration !== undefined);
}

function pluginsNamed(project, names) {
  return allPlugins(project).filter((plugin) => names.has(childAt(plugin, 'artifactId')?.text));
}

function resolvedRoot(module, value) {
  const relative = path.posix.normalize(value.replace(BASEDIR, ''));
  if (relative.includes('$') || relative.startsWith('/') || relative.startsWith('..')) {
    return undefined;
  }
  return module === '.' ? relative : path.posix.join(module, relative);
}

function helperRoots(project, module, { plugin, container, item }) {
  return pluginsNamed(project, new Set([plugin]))
    .flatMap((entry) => configurations(entry))
    .flatMap((configuration) => textsOf(configuration, container, item))
    .map((value) => resolvedRoot(module, value))
    .filter((root) => root !== undefined);
}

function rootsEntry({ project, module, file }, { set, directory, fallback, adders }) {
  const declared = childAt(project, 'build', directory)?.text?.trim();
  const roots = [
    resolvedRoot(module, declared ?? fallback),
    ...adders.flatMap((adder) => helperRoots(project, module, adder)),
  ].filter((root) => root !== undefined);
  return {
    type: 'roots',
    key: `maven:${module}:sourceSet:${set}`,
    file,
    label: `Maven ${set} source directories in ${file}`,
    set,
    roots: [...new Set(roots)],
  };
}

function rootEntries(context) {
  return [
    rootsEntry(context, {
      set: 'main',
      directory: 'sourceDirectory',
      fallback: 'src/main/java',
      adders: [
        { plugin: 'build-helper-maven-plugin', container: 'sources', item: 'source' },
        { plugin: 'kotlin-maven-plugin', container: 'sourceDirs', item: 'sourceDir' },
      ],
    }),
    rootsEntry(context, {
      set: 'test',
      directory: 'testSourceDirectory',
      fallback: 'src/test/java',
      adders: [{ plugin: 'build-helper-maven-plugin', container: 'sources', item: 'source' }],
    }),
  ];
}

function collectExcludes(project) {
  const found = new Map();
  function add(kind, patterns) {
    if (patterns.length > 0) {
      found.set(kind, [...(found.get(kind) ?? []), ...patterns]);
    }
  }
  for (const plugin of pluginsNamed(project, TEST_PLUGINS)) {
    for (const configuration of configurations(plugin)) {
      add('test', textsOf(configuration, 'excludes', 'exclude'));
      add(
        'tag',
        textsOf(configuration, 'excludedGroups').flatMap((groups) => groups.split(/[\s,]+/u)),
      );
      add(
        'tag',
        SKIP_SETTINGS.filter((name) => textsOf(configuration, name).includes('true')).map(
          (name) => `${name} = true`,
        ),
      );
    }
  }
  for (const plugin of pluginsNamed(project, new Set(['maven-compiler-plugin']))) {
    for (const configuration of configurations(plugin)) {
      add('source', textsOf(configuration, 'excludes', 'exclude'));
      add('test', textsOf(configuration, 'testExcludes', 'testExclude'));
    }
  }
  const properties = childAt(project, 'properties');
  add(
    'tag',
    SKIP_PROPERTIES.filter(
      (name) => properties !== undefined && textsOf(properties, name).includes('true'),
    ).map((name) => `${name} = true`),
  );
  return found;
}

function excludeEntries({ project, module, file }, roots) {
  return [...collectExcludes(project)].map(([kind, patterns]) => ({
    type: 'excludes',
    key: `maven:${module}:exclude:${kind}`,
    file,
    label: `Maven ${kind === 'source' ? 'compiler' : 'test'} excludes in ${file}`,
    patterns: [...new Set(patterns)],
    covers: excludeCovers(kind, roots),
  }));
}

function parsed(text) {
  try {
    return text === undefined ? undefined : parseXml(text);
  } catch {
    return { kind: 'malformed-xml' };
  }
}

export function readMavenSources(files, readFile) {
  return files
    .filter((file) => /(?:^|\/)pom\.xml$/u.test(file))
    .flatMap((file) => {
      const project = parsed(readFile(file));
      if (project?.name !== 'project') {
        return [];
      }
      const context = { project, module: path.posix.dirname(file), file };
      const roots = rootEntries(context);
      return [...roots, ...excludeEntries(context, roots)];
    });
}
