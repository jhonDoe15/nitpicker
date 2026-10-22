import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  formatTool,
  resolveTools,
  toolDependencies,
} from '../../../languages/java/maven/maven-tools.mjs';

const JAVA_DIRECTORY = path.resolve(import.meta.dirname, '../../../languages/java');
const GRADLE_SCRIPTS = [
  path.join(JAVA_DIRECTORY, 'gradle', 'nitpicker.init.gradle'),
  path.join(JAVA_DIRECTORY, 'gradle', 'errorprone', 'error-prone.gradle'),
];
const MAVEN_TOOLS = path.join(JAVA_DIRECTORY, 'maven', 'maven-tools.mjs');
const PINNED_COORDINATES = /([\w.-]+):([\w.-]+):\$\{(?:pinned|versions)\.(\w+)\}/g;
const PINNED_KEY = /\bpinned\.(\w+)/g;
const NOT_DOWNLOADED = new Set(['lizard']);

function source(file) {
  return readFileSync(file, 'utf8');
}

export function gradleToolCoordinates(pinned, scripts = GRADLE_SCRIPTS.map(source)) {
  const found = scripts.flatMap((text) => [...text.matchAll(PINNED_COORDINATES)]);
  return [
    ...new Map(
      found.map(([, group, artifact, key]) => [
        `${group}:${artifact}`,
        { key, coordinates: `${group}:${artifact}:${pinned[key]}` },
      ]),
    ).values(),
  ];
}

export function toolsWithoutCoordinates(pinned) {
  const keys = new Set([
    ...gradleToolCoordinates(pinned).map(({ key }) => key),
    ...[...source(MAVEN_TOOLS).matchAll(PINNED_KEY)].map(([, key]) => key),
  ]);
  return Object.keys(pinned).filter((key) => !keys.has(key) && !NOT_DOWNLOADED.has(key));
}

export function extraTools(pinned) {
  const formats = [...formatTool('google', pinned), ...formatTool('palantir', pinned)];
  const known = JSON.stringify(toolDependencies(pinned, [], formats));
  const gradleOnly = gradleToolCoordinates(pinned).filter(({ coordinates }) => {
    const [, artifact, version] = coordinates.split(':');
    return !known.includes(`<artifactId>${artifact}</artifactId><version>${version}</version>`);
  });
  return [
    ...formats,
    ...gradleOnly.map(({ coordinates }) => ({
      name: coordinates.split(':')[1],
      coordinates: [coordinates],
    })),
  ];
}

export function resolveToolJars({ projectRoot, maven, pinned }) {
  const classpaths = resolveTools({
    projectRoot,
    maven,
    pinned,
    launcherVersions: [],
    extraTools: extraTools(pinned),
  });
  return [...new Set(Object.values(classpaths).flat())];
}
