import path from 'node:path';
import { childAt, childrenAt, parseXml } from '../../../../shared/values/xml.mts';
import { messageOf } from '../../../../shared/values/readers.mts';
import type { XmlElement } from '../../../../shared/values/xml.mts';
import type {
  FileReader,
  FilterEntry,
  RootsEntry,
  SourceEntry,
} from '../typed/narrowing-types.mts';
import { SUREFIRE_CLASS, excludeCovers, includeScope } from './source-patterns.mts';

type Context = { readonly project: XmlElement; readonly module: string; readonly file: string };
type Adder = { readonly plugin: string; readonly container: string; readonly item: string };
type AddFilter = (action: string, kind: string, patterns: readonly string[]) => void;
type MavenFilter = { readonly action: string; readonly kind: string; readonly patterns: string[] };

const EXCLUDE = 'exclude';
const INCLUDE = 'include';
const SOURCE = 'source';
const EXCLUDES = 'excludes';
const INCLUDES = 'includes';
const INTEGRATION_TAG = 'integrationTag';
const BUILD = 'build';
const PLUGINS = 'plugins';
const PLUGIN = 'plugin';
const SUREFIRE = 'maven-surefire-plugin';
const FAILSAFE = 'maven-failsafe-plugin';
const BASEDIR = /^\$\{(?:project\.)?basedir\}\/?/u;
const SKIP_SETTINGS = ['skip', 'skipTests', 'skipITs'];
const SKIP_PROPERTIES = ['skipITs', 'skipTests'];
const LIST_SEPARATOR = /[\s,]+/u;
const PLUGIN_LISTS = [
  [BUILD, PLUGINS, PLUGIN],
  [BUILD, 'pluginManagement', PLUGINS, PLUGIN],
];

export function mavenTextsOf(
  element: XmlElement | undefined,
  ...names: readonly string[]
): string[] {
  return childrenAt(element, ...names)
    .map((child) => child.text?.trim())
    .filter((text): text is string => text !== undefined && text !== '');
}

function activeProfiles(project: XmlElement): XmlElement[] {
  return childrenAt(project, 'profiles', 'profile').filter(
    (profile) => childAt(profile, 'activation', 'activeByDefault')?.text?.trim() === 'true',
  );
}

function owners(project: XmlElement): XmlElement[] {
  return [project, ...activeProfiles(project)];
}

function allPlugins(project: XmlElement): XmlElement[] {
  return owners(project).flatMap((owner) =>
    PLUGIN_LISTS.flatMap((names) => childrenAt(owner, ...names)),
  );
}

export function configurations(plugin: XmlElement): XmlElement[] {
  return [
    childAt(plugin, 'configuration'),
    ...childrenAt(plugin, 'executions', 'execution').map((execution) =>
      childAt(execution, 'configuration'),
    ),
  ].filter((configuration) => configuration !== undefined);
}

export function pluginsNamed(project: XmlElement, names: ReadonlySet<string>): XmlElement[] {
  return allPlugins(project).filter((plugin) => {
    const artifact = childAt(plugin, 'artifactId')?.text;
    return artifact !== undefined && names.has(artifact);
  });
}

function resolvedRoot(module: string, value: string): string | undefined {
  const relative = path.posix.normalize(value.replace(BASEDIR, ''));
  if (relative.includes('$') || relative.startsWith('/') || relative.startsWith('..')) {
    return undefined;
  }
  return module === '.' ? relative : path.posix.join(module, relative);
}

function helperRoots(
  project: XmlElement,
  module: string,
  { plugin, container, item }: Adder,
): string[] {
  return pluginsNamed(project, new Set([plugin]))
    .flatMap((entry) => configurations(entry))
    .flatMap((configuration) => mavenTextsOf(configuration, container, item))
    .map((value) => resolvedRoot(module, value))
    .filter((root) => root !== undefined);
}

function declaredDirectory(project: XmlElement, directory: string): string | undefined {
  return owners(project)
    .map((owner) => childAt(owner, BUILD, directory)?.text?.trim())
    .findLast((value) => value !== undefined && value !== '');
}

function rootsEntry(
  { project, module, file }: Context,
  {
    set,
    directory,
    fallback,
    adders,
  }: {
    readonly set: string;
    readonly directory: string;
    readonly fallback: string;
    readonly adders: readonly Adder[];
  },
): RootsEntry {
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

function rootEntries(context: Context): RootsEntry[] {
  return [
    rootsEntry(context, {
      set: 'main',
      directory: 'sourceDirectory',
      fallback: 'src/main/java',
      adders: [
        { plugin: 'build-helper-maven-plugin', container: 'sources', item: SOURCE },
        { plugin: 'kotlin-maven-plugin', container: 'sourceDirs', item: 'sourceDir' },
      ],
    }),
    rootsEntry(context, {
      set: 'test',
      directory: 'testSourceDirectory',
      fallback: 'src/test/java',
      adders: [{ plugin: 'build-helper-maven-plugin', container: 'sources', item: SOURCE }],
    }),
  ];
}

function splitList(values: readonly string[]): string[] {
  return values.flatMap((value) => value.split(LIST_SEPARATOR)).filter(Boolean);
}

function skipsOf(configuration: XmlElement): string[] {
  return SKIP_SETTINGS.filter((name) => mavenTextsOf(configuration, name).includes('true')).map(
    (name) => `${name} = true`,
  );
}

function testPluginFilters(project: XmlElement, add: AddFilter): void {
  for (const plugin of pluginsNamed(project, new Set([SUREFIRE]))) {
    for (const configuration of configurations(plugin)) {
      add(EXCLUDE, 'test', mavenTextsOf(configuration, EXCLUDES, EXCLUDE));
      add(EXCLUDE, 'tag', splitList(mavenTextsOf(configuration, 'excludedGroups')));
      add(EXCLUDE, 'tag', skipsOf(configuration));
      add(INCLUDE, 'test', mavenTextsOf(configuration, INCLUDES, INCLUDE));
      add(INCLUDE, 'tag', splitList(mavenTextsOf(configuration, 'groups')));
      add(INCLUDE, 'name', splitList(mavenTextsOf(configuration, 'test')));
    }
  }
  for (const plugin of pluginsNamed(project, new Set([FAILSAFE]))) {
    for (const configuration of configurations(plugin)) {
      add(EXCLUDE, 'integration', mavenTextsOf(configuration, EXCLUDES, EXCLUDE));
      add(EXCLUDE, INTEGRATION_TAG, splitList(mavenTextsOf(configuration, 'excludedGroups')));
      add(EXCLUDE, INTEGRATION_TAG, skipsOf(configuration));
    }
  }
}

function compilerFilters(project: XmlElement, add: AddFilter): void {
  for (const plugin of pluginsNamed(project, new Set(['maven-compiler-plugin']))) {
    for (const configuration of configurations(plugin)) {
      add(EXCLUDE, SOURCE, mavenTextsOf(configuration, EXCLUDES, EXCLUDE));
      add(EXCLUDE, 'test', mavenTextsOf(configuration, 'testExcludes', 'testExclude'));
      add(INCLUDE, SOURCE, mavenTextsOf(configuration, INCLUDES, INCLUDE));
      add(INCLUDE, 'testSource', mavenTextsOf(configuration, 'testIncludes', 'testInclude'));
    }
  }
}

function bindsFailsafe(project: XmlElement): boolean {
  return owners(project)
    .flatMap((owner) => childrenAt(owner, BUILD, PLUGINS, PLUGIN))
    .some((plugin) => childAt(plugin, 'artifactId')?.text === FAILSAFE);
}

function skippedProperties(project: XmlElement): string[] {
  return owners(project)
    .map((owner) => childAt(owner, 'properties'))
    .filter((properties) => properties !== undefined)
    .flatMap((properties) =>
      SKIP_PROPERTIES.filter((name) => mavenTextsOf(properties, name).includes('true')),
    );
}

function collectFilters(project: XmlElement, runsFailsafe: boolean): MavenFilter[] {
  const found = new Map<string, MavenFilter>();
  function add(action: string, kind: string, patterns: readonly string[]): void {
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
    EXCLUDE,
    INTEGRATION_TAG,
    [...new Set(skipped)].map((name) => `${name} = true`),
  );
  return [...found.values()];
}

const COMPILER_KINDS = new Set([SOURCE, 'testSource']);

function labelOf({ action, kind }: MavenFilter, file: string): string {
  const owner =
    COMPILER_KINDS.has(kind) || (action === EXCLUDE && kind === SOURCE) ? 'compiler' : 'test';
  return `Maven ${owner} ${action}s in ${file}`;
}

function filterEntries(
  { project, module, file }: Context,
  {
    roots,
    runsFailsafe,
  }: { readonly roots: readonly RootsEntry[]; readonly runsFailsafe: boolean },
): FilterEntry[] {
  return collectFilters(project, runsFailsafe).map((filter) => ({
    type: filter.action === EXCLUDE ? EXCLUDES : INCLUDES,
    key: `maven:${module}:${filter.action}:${filter.kind}`,
    file,
    label: labelOf(filter, file),
    patterns: [...new Set(filter.patterns)],
    covers: excludeCovers(filter.kind, roots),
    ...(filter.action === INCLUDE ? includeScope(filter.kind, roots, SUREFIRE_CLASS) : {}),
  }));
}

function parsed(text: string | undefined): {
  root?: XmlElement | undefined;
  failure?: string | undefined;
} {
  if (text === undefined) {
    return {};
  }
  try {
    return { root: parseXml(text) };
  } catch (error) {
    return { failure: messageOf(error) };
  }
}

function inSubtree(module: string, other: string): boolean {
  return module === '.' || other === module || other.startsWith(`${module}/`);
}

export function readMavenSources(files: readonly string[], readFile: FileReader): SourceEntry[] {
  const poms = files
    .filter((file) => /(?:^|\/)pom\.xml$/u.test(file))
    .flatMap((file) => {
      const { root: project } = parsed(readFile(file));
      return project?.name === 'project'
        ? [{ project, module: path.posix.dirname(file), file }]
        : [];
    });
  const withRoots = poms.map((context) => ({ context, roots: rootEntries(context) }));
  const runsFailsafe = poms.some(({ project }) => bindsFailsafe(project));
  return withRoots.flatMap(({ context, roots }) => {
    const subtree = withRoots
      .filter((other) => inSubtree(context.module, other.context.module))
      .flatMap((other) => other.roots);
    return [...roots, ...filterEntries(context, { roots: subtree, runsFailsafe })];
  });
}
