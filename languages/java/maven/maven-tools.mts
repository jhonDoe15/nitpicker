import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { JAVA_FORMATTERS } from '../adapters/style/jvm-formatters.mts';
import { runMaven } from './maven-command.mts';
import { explainedError } from '../../../shared/messages/troubleshooting.mjs';
import { fieldOf, fieldsOf, textOf, textsOf } from '../../../shared/values/readers.mts';
import type { JavaEnvironment, JavaSpawn } from '../adapters/typed/java-values.mts';
import { POM, toolPath, writeToolsProject } from './programs/tools-project.mts';
import { withoutPitTools, withoutTestTools } from './quick/maven-quick.mts';

import type {
  ToolClasspathLists,
  ToolDependencies,
  ToolEntry,
  ToolSetRequest,
} from './typed/maven-values.mts';

const explained: (message: string) => Error = explainedError;

function optionalTexts(value: unknown): string[] | undefined {
  return Array.isArray(value) ? textsOf(value) : undefined;
}

function pin(pinned: unknown, name: string): string {
  return textOf(fieldOf(pinned, name));
}

export const MAVEN_PLUGINS = {
  dependency: 'org.apache.maven.plugins:maven-dependency-plugin:3.8.1',
  help: 'org.apache.maven.plugins:maven-help-plugin:3.5.1',
};
const TOOLS_KEY_LENGTH = 16;
const JACOCO_AGENT = 'jacocoAgentVersion';
const JUNIT_PLATFORM_EXCLUSIONS = [
  'org.junit.platform',
  'org.junit.jupiter',
  'org.opentest4j',
  'org.apiguardian',
];

export function jacocoPlugin(pinned: unknown, modules: readonly unknown[] = []): string {
  const bound = modules.filter((module) => fieldOf(module, JACOCO_AGENT) !== undefined);
  const versions = [...new Set(bound.map((module) => fieldOf(module, JACOCO_AGENT)))];
  if (versions.length > 1) {
    const listed = bound.map(
      (module) =>
        `${textOf(fieldOf(module, 'coordinates'))} ${textOf(fieldOf(module, JACOCO_AGENT))}`,
    );
    throw explained(
      `The Maven modules bind different JaCoCo agent versions (${listed.join(', ')}). A test JVM ` +
        "can hold one JaCoCo agent version, and nitpicker runs the project's own: set one " +
        'jacoco-maven-plugin version for every module',
    );
  }
  return `org.jacoco:jacoco-maven-plugin:${textOf(versions[0] ?? fieldOf(pinned, 'jacoco'))}`;
}

export function dependency(coordinates: string, exclusions: readonly string[] = []): string {
  const [groupId, artifactId, version, classifier] = coordinates.split(':');
  const excluded = exclusions
    .map((group) => `<exclusion><groupId>${group}</groupId><artifactId>*</artifactId></exclusion>`)
    .join('');
  return [
    '<dependency>',
    `<groupId>${String(groupId)}</groupId><artifactId>${String(artifactId)}</artifactId>` +
      `<version>${String(version)}</version>`,
    classifier === undefined ? '' : `<classifier>${classifier}</classifier>`,
    excluded === '' ? '' : `<exclusions>${excluded}</exclusions>`,
    '</dependency>',
  ].join('');
}

export function formatTool(
  javaStyle: string | undefined,
  pinned: unknown,
  version?: string,
): ToolEntry[] {
  const formatter = JAVA_FORMATTERS[javaStyle ?? 'google'];
  const versions = Object.fromEntries(
    Object.entries(fieldsOf(pinned)).map(([name, value]) => [name, textOf(value)]),
  );
  return formatter === undefined
    ? []
    : [{ name: formatter.classpath, coordinates: [formatter.coordinates(versions, version)] }];
}

export function archunitTool(
  pinned: unknown,
  { runsRules }: { readonly runsRules: boolean },
): ToolEntry[] {
  return runsRules
    ? [
        {
          name: 'archunit',
          coordinates: [
            `com.tngtech.archunit:archunit:${pin(pinned, 'archunit')}`,
            `org.ow2.asm:asm-analysis:${pin(pinned, 'asm')}`,
          ],
        },
      ]
    : [];
}

export function effectsTool(pinned: unknown): ToolEntry[] {
  const asm = pin(pinned, 'asm');
  return [
    {
      name: 'effects',
      coordinates: [
        `org.ow2.asm:asm:${asm}`,
        `org.ow2.asm:asm-tree:${asm}`,
        `org.ow2.asm:asm-analysis:${asm}`,
      ],
    },
  ];
}

export function toolDependencies(
  pinned: unknown,
  launcherVersions: readonly unknown[] = [],
  extraTools: readonly unknown[] = [],
): ToolDependencies {
  function at(name: string): string {
    return pin(pinned, name);
  }
  return {
    pmd: [
      dependency(`net.sourceforge.pmd:pmd-cli:${at('pmd')}`),
      dependency(`net.sourceforge.pmd:pmd-java:${at('pmd')}`),
    ],
    forbiddenapis: [dependency(`de.thetaphi:forbiddenapis:${at('forbiddenapis')}`)],
    spotbugs: [dependency(`com.github.spotbugs:spotbugs:${at('spotbugs')}`)],
    checkstyle: [dependency(`com.puppycrawl.tools:checkstyle:${at('checkstyle')}`)],
    errorprone: [
      dependency(`com.google.errorprone:error_prone_core:${at('errorProne')}`),
      dependency(`com.uber.nullaway:nullaway:${at('nullAway')}`),
    ],
    jacoco: [dependency(`org.jacoco:org.jacoco.cli:${at('jacoco')}:nodeps`)],
    pit: [dependency(`org.pitest:pitest-command-line:${at('pitest')}`)],
    'pit-junit5': [
      dependency(
        `org.pitest:pitest-junit5-plugin:${at('pitestJunit5')}`,
        JUNIT_PLATFORM_EXCLUSIONS,
      ),
    ],
    'pit-testng': [dependency(`org.pitest:pitest-testng-plugin:${at('pitestTestng')}`)],
    ...Object.fromEntries(
      launcherVersions.map((version) => [
        `launcher-${textOf(version)}`,
        [dependency(`org.junit.platform:junit-platform-launcher:${textOf(version)}`)],
      ]),
    ),
    ...Object.fromEntries(
      extraTools.map((tool) => [
        textOf(fieldOf(tool, 'name')),
        textsOf(fieldOf(tool, 'coordinates')).map((entry) =>
          dependency(entry, optionalTexts(fieldOf(tool, 'exclusions'))),
        ),
      ]),
    ),
  };
}

export function readClasspaths(directory: string, names: readonly string[]): ToolClasspathLists {
  return Object.fromEntries(
    names.map((name) => {
      const file = toolPath(directory, name, 'classpath.txt');
      const text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
      return [name, text === '' ? [] : text.split(path.delimiter)];
    }),
  );
}

export function missing(classpaths: Readonly<Record<string, readonly string[]>>): string[] {
  return Object.entries(classpaths)
    .filter(([, jars]) => jars.length === 0 || !jars.every((jar) => existsSync(jar)))
    .map(([name]) => name);
}

export function toolsKey(tools: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(tools))
    .digest('hex')
    .slice(0, TOOLS_KEY_LENGTH);
}

export function cacheDirectory(name: string, environment: JavaEnvironment): string {
  const configured = environment['XDG_CACHE_HOME'];
  const home =
    configured === undefined || configured === '' ? path.join(homedir(), '.cache') : configured;
  const root = path.join(home, 'nitpicker');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return path.join(root, name);
}

export function publishDirectory(staging: string, target: string): void {
  try {
    renameSync(staging, target);
  } catch (raced) {
    rmSync(staging, { recursive: true, force: true });
    if (!existsSync(target)) {
      throw raced;
    }
  }
}

function resolveInto(
  staging: string,
  { projectRoot, maven, tools, spawn, timeoutMs }: ToolSetRequest,
): ToolClasspathLists {
  writeToolsProject(staging, tools);
  runMaven({
    projectRoot,
    maven,
    spawn,
    timeoutMs,
    args: [
      '--quiet',
      '--file',
      path.join(staging, POM),
      `${MAVEN_PLUGINS.dependency}:build-classpath`,
      '-Dmdep.outputFile=classpath.txt',
    ],
  });
  return readClasspaths(staging, Object.keys(tools));
}

export function resolveToolSet(request: ToolSetRequest): ToolClasspathLists {
  const directory = cacheDirectory(
    `maven-tools-${toolsKey(request.tools)}`,
    request.environment ?? {},
  );
  const cached = readClasspaths(directory, Object.keys(request.tools));
  if (missing(cached).length === 0) {
    return cached;
  }
  const staging = mkdtempSync(`${directory}.staging-`);
  try {
    const resolved = resolveInto(staging, request);
    const unresolved = missing(resolved);
    if (unresolved.length > 0) {
      throw new Error(
        `Maven resolved no jars for ${unresolved.join(', ')} under ${directory}. Check that Maven can download from its repositories, then rerun`,
      );
    }
    rmSync(directory, { recursive: true, force: true });
    publishDirectory(staging, directory);
    return resolved;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function resolveTools({
  projectRoot,
  maven,
  pinned,
  launcherVersions,
  extraTools,
  spawn,
  timeoutMs,
  quick,
  mutationOff,
  environment,
}: {
  readonly projectRoot: string;
  readonly maven?: string | undefined;
  readonly pinned: unknown;
  readonly launcherVersions?: readonly unknown[] | undefined;
  readonly extraTools?: readonly unknown[] | undefined;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
  readonly quick?: true | undefined;
  readonly mutationOff?: true | undefined;
  readonly environment?: JavaEnvironment | undefined;
}): ToolClasspathLists {
  const all = toolDependencies(pinned, launcherVersions, extraTools);
  return resolveToolSet({
    projectRoot,
    maven,
    tools:
      quick === true
        ? withoutTestTools(all)
        : withoutPitTools(all, { mutationOff: mutationOff === true }),
    spawn,
    timeoutMs,
    environment,
  });
}
