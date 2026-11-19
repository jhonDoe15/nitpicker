import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  formatTool,
  resolveTools,
  toolDependencies,
} from '../../../languages/java/maven/maven-tools.mts';

const JAVA_DIRECTORY = path.resolve(import.meta.dirname, '../../../languages/java');
const GRADLE_DIRECTORY = path.join(JAVA_DIRECTORY, 'gradle');
const GRADLE_SCRIPTS = [
  'nitpicker.init.gradle',
  'errorprone/error-prone.gradle',
  'kotlin/kotlin-detekt.gradle',
  'kotlin/kotlin-format.gradle',
].map((script) => path.join(GRADLE_DIRECTORY, script));
const MAVEN_TOOLS = path.join(JAVA_DIRECTORY, 'maven', 'maven-tools.mts');
const PINNED_COORDINATES = /([\w.-]+):([\w.-]+):\$\{(?:\w+ \?: )?(?:pinned|versions)\.(\w+)\}/g;
const PINNED_KEY = /\bpinned\.(\w+)|\bat\('(\w+)'\)|\bpin\(pinned, '(\w+)'\)/g;
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
    ...[...source(MAVEN_TOOLS).matchAll(PINNED_KEY)].map(
      ([, dotted, called, pinCall]) => dotted ?? called ?? pinCall,
    ),
  ]);
  return Object.keys(pinned).filter((key) => !(keys.has(key) || NOT_DOWNLOADED.has(key)));
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
