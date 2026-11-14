import { existsSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../../../shared/paths/contained-path.mjs';
import { readTextInside } from '../../discovery/repository-files.mjs';
import { includedBuilds } from '../../../../languages/java/builds/gradle-scripts/included-builds.mjs';
import { projectFiles } from '../../../../languages/java/builds/gradle-scripts/kotlin-plugin.mjs';

const MAVEN_PATHS = /<(?:module|relativePath)>\s*([^<\s]+)\s*<\/(?:module|relativePath)>/gu;
const BUILD_FILE = /^(?:pom\.xml|build\.gradle(?:\.kts)?)$/u;
const POM = 'pom.xml';
const GROUP_ID = 'groupId';
const ARTIFACT_ID = 'artifactId';
const PLACEHOLDER = /^\$\{([\w.-]+)\}$/u;
const COORDINATE = /["']([\w.-]+):([\w.-]+)(?::[^"'\s]*)?["']/gu;
const GRADLE_GROUP = /^\s*group\s*(?:=\s*)?["']([\w.-]+)["']/mu;
const ROOT_NAME = /rootProject\.name\s*=\s*["']([\w.-]+)["']/u;
const CATALOG_MODULE = /^\s*([\w-]+)\s*=\s*\{[^}\n]*module\s*=\s*["']([\w.-]+):([\w.-]+)["']/gmu;
const CATALOG_PARTS =
  /^\s*([\w-]+)\s*=\s*\{[^}\n]*group\s*=\s*["']([\w.-]+)["'][^}\n]*name\s*=\s*["']([\w.-]+)["']/gmu;
const OWN_BLOCKS =
  /<(parent|dependencies|dependencyManagement|build|profiles|reporting)>[\s\S]*?<\/\1>/gu;

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function tagOf(text, tag) {
  return new RegExp(`<${tag}>\\s*([^<\\s]+)\\s*</${tag}>`, 'u').exec(text)?.[1];
}

function mavenFolder(target) {
  return target.endsWith(POM) ? path.posix.dirname(target) : target;
}

function coordinate(group, artifact) {
  return `maven:${group}:${artifact}`;
}

function placeholderValues(own, parent, text) {
  const properties = /<properties>([\s\S]*?)<\/properties>/u.exec(text)?.[1] ?? '';
  const group = tagOf(own, GROUP_ID) ?? tagOf(parent, GROUP_ID);
  const known = new Map([
    ['project.groupId', group],
    ['pom.groupId', group],
    ['groupId', group],
    ['project.parent.groupId', tagOf(parent, GROUP_ID)],
    ['parent.groupId', tagOf(parent, GROUP_ID)],
    ['project.artifactId', tagOf(own, ARTIFACT_ID)],
  ]);
  return (value) => {
    const key = value === undefined ? undefined : PLACEHOLDER.exec(value)?.[1];
    if (key === undefined) {
      return value;
    }
    return known.get(key) ?? tagOf(properties, key);
  };
}

function pomCoordinates(text) {
  const own = text.replaceAll(OWN_BLOCKS, '');
  const parent = /<parent>([\s\S]*?)<\/parent>/u.exec(text)?.[1] ?? '';
  const resolve = placeholderValues(own, parent, text);
  const group = resolve(tagOf(own, GROUP_ID) ?? tagOf(parent, GROUP_ID));
  const artifact = resolve(tagOf(own, ARTIFACT_ID));
  const managed = text.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/gu, '');
  const needs = [...managed.matchAll(/<dependency>([\s\S]*?)<\/dependency>/gu)].flatMap(
    ([, block]) => {
      const needGroup = resolve(tagOf(block, GROUP_ID));
      const needArtifact = resolve(tagOf(block, ARTIFACT_ID));
      return needGroup === undefined || needArtifact === undefined
        ? []
        : [coordinate(needGroup, needArtifact)];
    },
  );
  return {
    names: group === undefined || artifact === undefined ? [] : [coordinate(group, artifact)],
    needs,
  };
}

function catalogNeeds(directory, buildText) {
  const catalog = readTextInside(directory, 'gradle/libs.versions.toml');
  const entries = [...catalog.matchAll(CATALOG_MODULE), ...catalog.matchAll(CATALOG_PARTS)];
  return entries
    .filter(([, alias]) => buildText.includes(`libs.${alias.replaceAll(/[-_]/gu, '.')}`))
    .map(([, , group, artifact]) => coordinate(group, artifact));
}

function gradleCoordinates(directory, file, text) {
  const group = GRADLE_GROUP.exec(text)?.[1];
  const folder = path.dirname(file);
  const settings = ['settings.gradle', 'settings.gradle.kts']
    .map((name) => readTextInside(directory, path.relative(directory, path.join(folder, name))))
    .join('\n');
  const name = ROOT_NAME.exec(settings)?.[1] ?? path.basename(folder);
  return {
    names: group === undefined ? [] : [coordinate(group, name)],
    needs: [
      ...[...text.matchAll(COORDINATE)].map(([, needGroup, artifact]) =>
        coordinate(needGroup, artifact),
      ),
      ...catalogNeeds(directory, text),
    ],
  };
}

const JVM_ROOT_FILES = [
  POM,
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
];

function coordinatesOf(directory) {
  function outside(relative) {
    return `${relative} leaves ${directory}`;
  }
  if (!JVM_ROOT_FILES.some((file) => existsSync(containedPath(directory, file, { outside })))) {
    return { names: [], needs: [] };
  }
  const read = projectFiles(directory, BUILD_FILE).map((file) => {
    const text = readTextInside(directory, path.relative(directory, file));
    return file.endsWith(POM) ? pomCoordinates(text) : gradleCoordinates(directory, file, text);
  });
  const names = read.flatMap((entry) => entry.names);
  const needs = [...new Set(read.flatMap((entry) => entry.needs))].filter(
    (need) => !names.includes(need),
  );
  return { names, needs };
}

export function jvmUnit(directory) {
  const gradle = includedBuilds(directory);
  const maven = matches(readTextInside(directory, POM), MAVEN_PATHS).map(mavenFolder);
  const { names, needs } = coordinatesOf(directory);
  return {
    names,
    needs,
    folders: [...gradle, ...maven.filter((folder) => folder.startsWith('..'))],
    labels: new Map(needs.map((need) => [need, need.slice('maven:'.length)])),
  };
}
