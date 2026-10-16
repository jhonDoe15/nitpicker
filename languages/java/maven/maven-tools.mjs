import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { runMaven } from './maven-command.mjs';

export const MAVEN_PLUGINS = {
  dependency: 'org.apache.maven.plugins:maven-dependency-plugin:3.8.1',
  help: 'org.apache.maven.plugins:maven-help-plugin:3.5.1',
};
const JUNIT_PLATFORM_EXCLUSIONS = [
  'org.junit.platform',
  'org.junit.jupiter',
  'org.opentest4j',
  'org.apiguardian',
];

export function jacocoPlugin(pinned) {
  return `org.jacoco:jacoco-maven-plugin:${pinned.jacoco}`;
}

function dependency(coordinates, exclusions = []) {
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

export function toolDependencies(pinned, launcherVersions = [], extraTools = []) {
  return {
    pmd: [
      dependency(`net.sourceforge.pmd:pmd-cli:${pinned.pmd}`),
      dependency(`net.sourceforge.pmd:pmd-java:${pinned.pmd}`),
    ],
    spotbugs: [dependency(`com.github.spotbugs:spotbugs:${pinned.spotbugs}`)],
    format: [
      dependency(`com.google.googlejavaformat:google-java-format:${pinned.googleJavaFormat}`),
    ],
    checkstyle: [dependency(`com.puppycrawl.tools:checkstyle:${pinned.checkstyle}`)],
    errorprone: [
      dependency(`com.google.errorprone:error_prone_core:${pinned.errorProne}`),
      dependency(`com.uber.nullaway:nullaway:${pinned.nullAway}`),
    ],
    jacoco: [dependency(`org.jacoco:org.jacoco.cli:${pinned.jacoco}:nodeps`)],
    pit: [
      dependency(`org.pitest:pitest-command-line:${pinned.pitest}`),
      dependency(
        `org.pitest:pitest-junit5-plugin:${pinned.pitestJunit5}`,
        JUNIT_PLATFORM_EXCLUSIONS,
      ),
    ],
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

function readClasspaths(directory, names) {
  return Object.fromEntries(
    names.map((name) => {
      const file = path.join(directory, name, 'classpath.txt');
      const text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
      return [name, text === '' ? [] : text.split(path.delimiter)];
    }),
  );
}

function missing(classpaths) {
  return Object.entries(classpaths)
    .filter(([, jars]) => jars.length === 0 || !jars.every((jar) => existsSync(jar)))
    .map(([name]) => name);
}

function cacheDirectory(key) {
  const root = path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache'), 'nitpicker');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return path.join(root, `maven-tools-${key}`);
}

export function resolveTools({ projectRoot, maven, pinned, launcherVersions, extraTools }) {
  const tools = toolDependencies(pinned, launcherVersions, extraTools);
  const key = createHash('sha256').update(JSON.stringify(tools)).digest('hex').slice(0, 16);
  const directory = cacheDirectory(key);
  const cached = readClasspaths(directory, Object.keys(tools));
  if (missing(cached).length === 0) {
    return cached;
  }
  writeToolsProject(directory, tools);
  runMaven({
    projectRoot,
    maven,
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
