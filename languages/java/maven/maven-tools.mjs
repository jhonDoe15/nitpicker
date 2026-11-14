import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { JAVA_FORMATTERS } from '../adapters/style/jvm-formatters.mjs';
import { runMaven } from './maven-command.mjs';
import { explainedError } from '../../../shared/messages/troubleshooting.mjs';
import { withoutTestTools } from './quick/maven-quick.mjs';

export const MAVEN_PLUGINS = {
  dependency: 'org.apache.maven.plugins:maven-dependency-plugin:3.8.1',
  help: 'org.apache.maven.plugins:maven-help-plugin:3.5.1',
};
const TOOLS_KEY_LENGTH = 16;
const JUNIT_PLATFORM_EXCLUSIONS = [
  'org.junit.platform',
  'org.junit.jupiter',
  'org.opentest4j',
  'org.apiguardian',
];

export function jacocoPlugin(pinned, modules = []) {
  const bound = modules.filter((module) => module.jacocoAgentVersion !== undefined);
  const versions = [...new Set(bound.map((module) => module.jacocoAgentVersion))];
  if (versions.length > 1) {
    const listed = bound.map((module) => `${module.coordinates} ${module.jacocoAgentVersion}`);
    throw explainedError(
      `The Maven modules bind different JaCoCo agent versions (${listed.join(', ')}). A test JVM ` +
        "can hold one JaCoCo agent version, and nitpicker runs the project's own: set one " +
        'jacoco-maven-plugin version for every module',
    );
  }
  return `org.jacoco:jacoco-maven-plugin:${versions[0] ?? pinned.jacoco}`;
}

export function dependency(coordinates, exclusions = []) {
  const [groupId, artifactId, version, classifier] = coordinates.split(':');
  const excluded = exclusions
    .map((group) => `<exclusion><groupId>${group}</groupId><artifactId>*</artifactId></exclusion>`)
    .join('');
  return [
    '<dependency>',
    `<groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId><version>${version}</version>`,
    classifier === undefined ? '' : `<classifier>${classifier}</classifier>`,
    excluded === '' ? '' : `<exclusions>${excluded}</exclusions>`,
    '</dependency>',
  ].join('');
}

export function formatTool(javaStyle, pinned) {
  const formatter = JAVA_FORMATTERS[javaStyle ?? 'google'];
  return formatter === undefined
    ? []
    : [{ name: formatter.classpath, coordinates: [formatter.coordinates(pinned)] }];
}

export function archunitTool(runsRules, pinned) {
  return runsRules
    ? [
        {
          name: 'archunit',
          coordinates: [
            `com.tngtech.archunit:archunit:${pinned.archunit}`,
            `org.ow2.asm:asm-analysis:${pinned.asm}`,
          ],
        },
      ]
    : [];
}

export function toolDependencies(pinned, launcherVersions = [], extraTools = []) {
  return {
    pmd: [
      dependency(`net.sourceforge.pmd:pmd-cli:${pinned.pmd}`),
      dependency(`net.sourceforge.pmd:pmd-java:${pinned.pmd}`),
    ],
    forbiddenapis: [dependency(`de.thetaphi:forbiddenapis:${pinned.forbiddenapis}`)],
    spotbugs: [dependency(`com.github.spotbugs:spotbugs:${pinned.spotbugs}`)],
    spotbugsPlugins: [
      dependency(`com.h3xstream.findsecbugs:findsecbugs-plugin:${pinned.findSecBugs}`),
    ],
    checkstyle: [dependency(`com.puppycrawl.tools:checkstyle:${pinned.checkstyle}`)],
    errorprone: [
      dependency(`com.google.errorprone:error_prone_core:${pinned.errorProne}`),
      dependency(`com.uber.nullaway:nullaway:${pinned.nullAway}`),
    ],
    jacoco: [dependency(`org.jacoco:org.jacoco.cli:${pinned.jacoco}:nodeps`)],
    pit: [dependency(`org.pitest:pitest-command-line:${pinned.pitest}`)],
    'pit-junit5': [
      dependency(
        `org.pitest:pitest-junit5-plugin:${pinned.pitestJunit5}`,
        JUNIT_PLATFORM_EXCLUSIONS,
      ),
    ],
    'pit-testng': [dependency(`org.pitest:pitest-testng-plugin:${pinned.pitestTestng}`)],
    ...Object.fromEntries(
      launcherVersions.map((version) => [
        `launcher-${version}`,
        [dependency(`org.junit.platform:junit-platform-launcher:${version}`)],
      ]),
    ),
    ...Object.fromEntries(
      extraTools.map(({ name, coordinates, exclusions }) => [
        name,
        coordinates.map((entry) => dependency(entry, exclusions)),
      ]),
    ),
  };
}

function pom(artifactId, body) {
  return [
    '<project xmlns="http://maven.apache.org/POM/4.0.0">',
    '<modelVersion>4.0.0</modelVersion>',
    `<groupId>nitpicker.tools</groupId><artifactId>${artifactId}</artifactId><version>1</version>`,
    '<packaging>pom</packaging>',
    body,
    '</project>',
    '',
  ].join('\n');
}

function writeToolsProject(directory, tools) {
  for (const [name, dependencies] of Object.entries(tools)) {
    mkdirSync(path.join(directory, name), { recursive: true });
    writeFileSync(
      path.join(directory, name, 'pom.xml'),
      pom(name, `<dependencies>${dependencies.join('')}</dependencies>`),
    );
  }
  const modules = Object.keys(tools)
    .map((name) => `<module>${name}</module>`)
    .join('');
  writeFileSync(path.join(directory, 'pom.xml'), pom('tools', `<modules>${modules}</modules>`));
}

export function readClasspaths(directory, names) {
  return Object.fromEntries(
    names.map((name) => {
      const file = path.join(directory, name, 'classpath.txt');
      const text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
      return [name, text === '' ? [] : text.split(path.delimiter)];
    }),
  );
}

export function missing(classpaths) {
  return Object.entries(classpaths)
    .filter(([, jars]) => jars.length === 0 || !jars.every((jar) => existsSync(jar)))
    .map(([name]) => name);
}

export function toolsKey(tools) {
  return createHash('sha256')
    .update(JSON.stringify(tools))
    .digest('hex')
    .slice(0, TOOLS_KEY_LENGTH);
}

export function cacheDirectory(name) {
  const root = path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache'), 'nitpicker');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return path.join(root, name);
}

export function publishDirectory(staging, target) {
  try {
    renameSync(staging, target);
  } catch (raced) {
    rmSync(staging, { recursive: true, force: true });
    if (!existsSync(target)) {
      throw raced;
    }
  }
}

export function resolveToolSet({ projectRoot, maven, tools, spawn, timeoutMs }) {
  const directory = cacheDirectory(`maven-tools-${toolsKey(tools)}`);
  const cached = readClasspaths(directory, Object.keys(tools));
  if (missing(cached).length === 0) {
    return cached;
  }
  writeToolsProject(directory, tools);
  runMaven({
    projectRoot,
    maven,
    spawn,
    timeoutMs,
    args: [
      '--quiet',
      '--file',
      path.join(directory, 'pom.xml'),
      `${MAVEN_PLUGINS.dependency}:build-classpath`,
      '-Dmdep.outputFile=classpath.txt',
    ],
  });
  const resolved = readClasspaths(directory, Object.keys(tools));
  const unresolved = missing(resolved);
  if (unresolved.length > 0) {
    throw new Error(
      `Maven resolved no jars for ${unresolved.join(', ')} under ${directory}. Check that Maven can download from its repositories, then rerun`,
    );
  }
  return resolved;
}

export function resolveTools({
  projectRoot,
  maven,
  pinned,
  launcherVersions,
  extraTools,
  spawn,
  timeoutMs,
  quick = false,
}) {
  const all = toolDependencies(pinned, launcherVersions, extraTools);
  return resolveToolSet({
    projectRoot,
    maven,
    tools: quick ? withoutTestTools(all) : all,
    spawn,
    timeoutMs,
  });
}
