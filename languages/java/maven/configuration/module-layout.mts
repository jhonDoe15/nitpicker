import { existsSync } from 'node:fs';
import path from 'node:path';
import { isStrictlyInside } from '../../../../shared/filesystem.mjs';
import { type XmlElement, childrenAt } from '../../../../shared/values/xml.mts';
import { executionsWithGoal, textAt } from './pom-elements.mts';

type LayoutRequest = {
  readonly build: XmlElement | undefined;
  readonly plugins: ReadonlyMap<string, XmlElement>;
  readonly basedir: string;
  readonly buildDirectory: string;
};
export type ModuleLayout = {
  readonly outputDirectory: string;
  readonly testOutputDirectory: string;
  readonly sourceRoots: string[];
  readonly testSourceRoots: string[];
  readonly resourceRoots: string[];
};
export type JacocoSettings = {
  readonly jacocoDestFiles: string[];
  readonly jacocoAgentVersion: string | undefined;
};

export const DIRECTORY = 'directory';
const CONFIGURATION = 'configuration';
const BUILD_HELPER = 'org.codehaus.mojo:build-helper-maven-plugin';
const GMAVENPLUS = 'org.codehaus.gmavenplus:gmavenplus-plugin';
const GROOVY_TEST_ROOT = 'src/test/groovy';
const AGENT_GOALS = ['prepare-agent', 'prepare-agent-integration'];

export function configured(
  execution: XmlElement | undefined,
  plugin: XmlElement | undefined,
  name: string,
): string | undefined {
  return textAt(execution, CONFIGURATION, name) ?? textAt(plugin, CONFIGURATION, name);
}

function rootsInside(basedir: string, roots: readonly string[]): string[] {
  const resolved = roots.map((root) => path.resolve(basedir, root));
  return [
    ...new Set(resolved.filter((root) => root === basedir || isStrictlyInside(basedir, root))),
  ];
}

function helperRoots(plugin: XmlElement | undefined, goal: string, basedir: string): string[] {
  const sources =
    plugin === undefined
      ? []
      : executionsWithGoal(plugin, goal).flatMap((execution) =>
          childrenAt(execution, CONFIGURATION, 'sources', 'source').map(
            (source) => source.text ?? '.',
          ),
        );
  return rootsInside(basedir, sources);
}

function groovyTestRoots(plugin: XmlElement | undefined, basedir: string): string[] {
  const declared = (
    plugin === undefined ? [] : [plugin, ...childrenAt(plugin, 'executions', 'execution')]
  )
    .flatMap((element) => childrenAt(element, CONFIGURATION, 'testSources', 'testSource'))
    .flatMap((source) => {
      const directory = textAt(source, DIRECTORY);
      return directory === undefined ? [] : [directory];
    });
  const pluginDefault = plugin !== undefined && declared.length === 0;
  const present = existsSync(path.join(basedir, GROOVY_TEST_ROOT));
  return rootsInside(basedir, [
    ...declared,
    ...(pluginDefault || present ? [GROOVY_TEST_ROOT] : []),
  ]);
}

function agentExecutions(plugin: XmlElement | undefined): XmlElement[] {
  return plugin === undefined
    ? []
    : AGENT_GOALS.flatMap((goal) => executionsWithGoal(plugin, goal));
}

function jacocoDestFiles(plugin: XmlElement | undefined, basedir: string): string[] {
  const files = agentExecutions(plugin).flatMap((execution) => {
    const file = configured(execution, plugin, 'destFile');
    return file === undefined ? [] : [file];
  });
  return [...new Set(files.map((file) => path.resolve(basedir, file)))];
}

function jacocoAgentVersion(plugin: XmlElement | undefined): string | undefined {
  const version = plugin === undefined ? undefined : textAt(plugin, 'version')?.trim();
  const agents = agentExecutions(plugin).filter(
    (execution) => textAt(execution, 'phase') !== 'none',
  );
  return agents.length === 0 || version === undefined || version.includes('${')
    ? undefined
    : version;
}

export function jacocoSettings(plugin: XmlElement | undefined, basedir: string): JacocoSettings {
  return {
    jacocoDestFiles: jacocoDestFiles(plugin, basedir),
    jacocoAgentVersion: jacocoAgentVersion(plugin),
  };
}

export function resolvedText(
  build: XmlElement | undefined,
  basedir: string,
  name: string,
): string | undefined {
  const value = textAt(build, name);
  return value === undefined ? undefined : path.resolve(basedir, value);
}

function resourceRootsOf(build: XmlElement | undefined, basedir: string): string[] {
  return [
    ...new Set(
      childrenAt(build, 'resources', 'resource').flatMap((resource) => {
        const directory = textAt(resource, DIRECTORY);
        return directory === undefined ? [] : [path.resolve(basedir, directory)];
      }),
    ),
  ];
}

export function layoutOf({ build, plugins, basedir, buildDirectory }: LayoutRequest): ModuleLayout {
  return {
    outputDirectory:
      resolvedText(build, basedir, 'outputDirectory') ?? path.join(buildDirectory, 'classes'),
    testOutputDirectory:
      resolvedText(build, basedir, 'testOutputDirectory') ??
      path.join(buildDirectory, 'test-classes'),
    sourceRoots: [
      resolvedText(build, basedir, 'sourceDirectory') ?? path.join(basedir, 'src/main/java'),
      ...helperRoots(plugins.get(BUILD_HELPER), 'add-source', basedir),
    ],
    testSourceRoots: [
      resolvedText(build, basedir, 'testSourceDirectory') ?? path.join(basedir, 'src/test/java'),
      ...helperRoots(plugins.get(BUILD_HELPER), 'add-test-source', basedir),
      ...groovyTestRoots(plugins.get(GMAVENPLUS), basedir),
    ],
    resourceRoots: resourceRootsOf(build, basedir),
  };
}
