import path from 'node:path';
import { childAt, childrenAt, parseXml } from '../../../../shared/ingest/common.mjs';
import { SUREFIRE_CLASS, excludeCovers, includeScope } from './source-patterns.mjs';

const SUREFIRE = 'maven-surefire-plugin';
const FAILSAFE = 'maven-failsafe-plugin';
const BASEDIR = /^\$\{(?:project\.)?basedir\}\/?/u;
const SKIP_SETTINGS = ['skip', 'skipTests', 'skipITs'];
const SKIP_PROPERTIES = ['skipITs', 'skipTests'];
const LIST_SEPARATOR = /[\s,]+/u;
const PLUGIN_LISTS = [
  ['build', 'plugins', 'plugin'],
  ['build', 'pluginManagement', 'plugins', 'plugin'],
];

function textsOf(element, ...names) {
  return childrenAt(element, ...names)
    .map((child) => child.text?.trim())
    .filter((text) => text !== undefined && text !== '');
}

function activeProfiles(project) {
  return childrenAt(project, 'profiles', 'profile').filter(
    (profile) => childAt(profile, 'activation', 'activeByDefault')?.text?.trim() === 'true',
  );
}

function owners(project) {
  return [project, ...activeProfiles(project)];
}

function allPlugins(project) {
  return owners(project).flatMap((owner) =>
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

function declaredDirectory(project, directory) {
  return owners(project)
    .map((owner) => childAt(owner, 'build', directory)?.text?.trim())
    .findLast((value) => value !== undefined && value !== '');
}

function rootsEntry({ project, module, file }, { set, directory, fallback, adders }) {
  const declared = declaredDirectory(project, directory);
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

function splitList(values) {
  return values.flatMap((value) => value.split(LIST_SEPARATOR)).filter(Boolean);
}

function skipsOf(configuration) {
  return SKIP_SETTINGS.filter((name) => textsOf(configuration, name).includes('true')).map(
    (name) => `${name} = true`,
  );
}

function testPluginFilters(project, add) {
  for (const plugin of pluginsNamed(project, new Set([SUREFIRE]))) {
    for (const configuration of configurations(plugin)) {
      add('exclude', 'test', textsOf(configuration, 'excludes', 'exclude'));
      add('exclude', 'tag', splitList(textsOf(configuration, 'excludedGroups')));
      add('exclude', 'tag', skipsOf(configuration));
      add('include', 'test', textsOf(configuration, 'includes', 'include'));
      add('include', 'tag', splitList(textsOf(configuration, 'groups')));
      add('include', 'name', splitList(textsOf(configuration, 'test')));
    }
  }
  for (const plugin of pluginsNamed(project, new Set([FAILSAFE]))) {
    for (const configuration of configurations(plugin)) {
      add('exclude', 'integration', textsOf(configuration, 'excludes', 'exclude'));
      add('exclude', 'integrationTag', splitList(textsOf(configuration, 'excludedGroups')));
      add('exclude', 'integrationTag', skipsOf(configuration));
    }
  }
}

function compilerFilters(project, add) {
  for (const plugin of pluginsNamed(project, new Set(['maven-compiler-plugin']))) {
    for (const configuration of configurations(plugin)) {
      add('exclude', 'source', textsOf(configuration, 'excludes', 'exclude'));
      add('exclude', 'test', textsOf(configuration, 'testExcludes', 'testExclude'));
      add('include', 'source', textsOf(configuration, 'includes', 'include'));
      add('include', 'testSource', textsOf(configuration, 'testIncludes', 'testInclude'));
    }
  }
}

function bindsFailsafe(project) {
  return owners(project)
    .flatMap((owner) => childrenAt(owner, 'build', 'plugins', 'plugin'))
    .some((plugin) => childAt(plugin, 'artifactId')?.text === FAILSAFE);
}

function skippedProperties(project) {
  return owners(project)
    .map((owner) => childAt(owner, 'properties'))
    .filter((properties) => properties !== undefined)
    .flatMap((properties) =>
      SKIP_PROPERTIES.filter((name) => textsOf(properties, name).includes('true')),
    );
}

function collectFilters(project, runsFailsafe) {
  const found = new Map();
  function add(action, kind, patterns) {
    if (patterns.length > 0) {
      const key = `${action}:${kind}`;
      found.set(key, {
        action,
        kind,
        patterns: [...(found.get(key)?.patterns ?? []), ...patterns],
      });
    }
  }
  testPluginFilters(project, add);
  compilerFilters(project, add);
  const skipped = runsFailsafe ? skippedProperties(project) : [];
  add(
    'exclude',
    'integrationTag',
    [...new Set(skipped)].map((name) => `${name} = true`),
  );
  return [...found.values()];
}

const COMPILER_KINDS = new Set(['source', 'testSource']);

function labelOf({ action, kind }, file) {
  const owner =
    COMPILER_KINDS.has(kind) || (action === 'exclude' && kind === 'source') ? 'compiler' : 'test';
  return `Maven ${owner} ${action}s in ${file}`;
}

function filterEntries({ project, module, file }, { roots, runsFailsafe }) {
  return collectFilters(project, runsFailsafe).map((filter) => ({
    type: filter.action === 'exclude' ? 'excludes' : 'includes',
    key: `maven:${module}:${filter.action}:${filter.kind}`,
    file,
    label: labelOf(filter, file),
    patterns: [...new Set(filter.patterns)],
    covers: excludeCovers(filter.kind, roots),
    ...(filter.action === 'include' ? includeScope(filter.kind, roots, SUREFIRE_CLASS) : {}),
  }));
}

function parsed(text) {
  try {
    return text === undefined ? undefined : parseXml(text);
  } catch {
    return { kind: 'malformed-xml' };
  }
}

function inSubtree(module, other) {
  return module === '.' || other === module || other.startsWith(`${module}/`);
}

export function readMavenSources(files, readFile) {
  const poms = files
    .filter((file) => /(?:^|\/)pom\.xml$/u.test(file))
    .map((file) => ({ project: parsed(readFile(file)), module: path.posix.dirname(file), file }))
    .filter(({ project }) => project?.name === 'project');
  const withRoots = poms.map((context) => ({ context, roots: rootEntries(context) }));
  const runsFailsafe = poms.some(({ project }) => bindsFailsafe(project));
  return withRoots.flatMap(({ context, roots }) => {
    const subtree = withRoots
      .filter((other) => inSubtree(context.module, other.context.module))
      .flatMap((other) => other.roots);
    return [...roots, ...filterEntries(context, { roots: subtree, runsFailsafe })];
  });
}
