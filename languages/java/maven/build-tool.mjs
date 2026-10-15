import { existsSync } from 'node:fs';
import path from 'node:path';

const GRADLE_FILES = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];

export function detectBuildTool(projectRoot) {
  const hasGradle = GRADLE_FILES.some((name) => existsSync(path.join(projectRoot, name)));
  return !hasGradle && existsSync(path.join(projectRoot, 'pom.xml')) ? 'maven' : 'gradle';
}
