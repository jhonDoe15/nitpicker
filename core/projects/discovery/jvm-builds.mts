import path from 'node:path';
import type { WorkspaceDeclaration, WorkspaceMember } from '../project-types.mts';
import {
  hasGradleSettings,
  hasJvmSources,
  includedSourceBuilds,
  includesSubprojects,
} from '../../../languages/java/builds/gradle-scripts/included-builds.mts';
import { BUILD_LOGIC_FOLDERS } from '../../../languages/java/builds/gradle-scripts/kotlin-plugin.mts';
import {
  isInside,
  isSkippedLocation,
  outermost,
  readTextInside,
  statInside,
} from './repository-files.mts';

export const JVM_MARKERS = [
  'settings.gradle',
  'settings.gradle.kts',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
];
const GRADLE_MARKERS = JVM_MARKERS.filter((marker) => marker.includes('gradle'));
const MAVEN_MODULE = /<module>\s*([^<\s]+)\s*<\/module>/gu;
const COMPOSITE_ORIGIN = 'Gradle includeBuild';

function isGradle(root: string, directory: string): boolean {
  return GRADLE_MARKERS.some((marker) => statInside(root, directory, marker) !== undefined);
}

function originOf(root: string, directory: string): string {
  return isGradle(root, directory) ? 'Gradle build' : 'Maven build';
}

function relativeTo(directory: string, parent: string): string {
  return parent === '.' ? directory : directory.slice(parent.length + 1);
}

function mavenModules(root: string, directory: string): string[] {
  const pom = readTextInside(root, path.join(directory, 'pom.xml'));
  return [...pom.matchAll(MAVEN_MODULE)].map((match) =>
    path.posix.normalize((match[1] ?? '').replace(/\/?pom\.xml$/u, '')).replace(/\/+$/u, ''),
  );
}

function enclosingBuilds(directory: string, jvmDirectories: readonly string[]): string[] {
  return jvmDirectories.filter((other) => other !== directory && isInside(directory, other));
}

function isSeparateBuild(
  root: string,
  directory: string,
  jvmDirectories: readonly string[],
): boolean {
  if (hasGradleSettings(path.join(root, directory))) {
    return true;
  }
  if (isGradle(root, directory)) {
    return false;
  }
  return !enclosingBuilds(directory, jvmDirectories).some((parent) =>
    mavenModules(root, parent).includes(relativeTo(directory, parent)),
  );
}

export function isBuildModule(
  root: string,
  directory: string,
  jvmDirectories: readonly string[],
): boolean {
  return (
    enclosingBuilds(directory, jvmDirectories).length > 0 &&
    !isSeparateBuild(root, directory, jvmDirectories)
  );
}

function isSourceBuild(root: string, directory: string): boolean {
  return (
    !BUILD_LOGIC_FOLDERS.includes(path.posix.basename(directory)) &&
    hasJvmSources(path.join(root, directory))
  );
}

export function jvmBuilds(root: string, directories: readonly string[]): WorkspaceMember[] {
  const candidates = directories.filter(
    (directory) => directory === '.' || !isSkippedLocation(directory),
  );
  const outer = outermost(candidates, { rootContainsAll: true });
  const nested = candidates.filter(
    (directory) =>
      !outer.includes(directory) &&
      isSeparateBuild(root, directory, candidates) &&
      isSourceBuild(root, directory),
  );
  return [...outer, ...nested].map((directory) => ({
    path: directory,
    origin: originOf(root, directory),
  }));
}

export function gradleComposite(root: string): WorkspaceDeclaration {
  const builds = includedSourceBuilds(root);
  if (builds.length === 0) {
    return { declared: false, members: [] };
  }
  const own = includesSubprojects(root) || hasJvmSources(path.join(root, 'src'));
  return {
    declared: true,
    members: [
      ...(own ? [{ path: '.', origin: COMPOSITE_ORIGIN }] : []),
      ...builds.map((build) => ({ path: build, origin: COMPOSITE_ORIGIN })),
    ],
  };
}
