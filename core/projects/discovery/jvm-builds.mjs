import { isSkippedLocation, outermost, statInside } from './repository-files.mjs';

export const JVM_MARKERS = [
  'settings.gradle',
  'settings.gradle.kts',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
];
const GRADLE_MARKERS = JVM_MARKERS.filter((marker) => marker.includes('gradle'));

function originOf(root, directory) {
  const isGradle = GRADLE_MARKERS.some(
    (marker) => statInside(root, directory, marker) !== undefined,
  );
  return isGradle ? 'Gradle build' : 'Maven build';
}

export function jvmBuilds(root, directories) {
  const candidates = directories.filter(
    (directory) => directory === '.' || !isSkippedLocation(directory),
  );
  return outermost(candidates, { rootContainsAll: true }).map((directory) => ({
    path: directory,
    origin: originOf(root, directory),
  }));
}
