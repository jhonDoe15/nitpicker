import { readTextInside } from '../discovery/repository-files.mjs';
import { readPyproject } from '../../configuration/project-checks/uv-workspace.mjs';
import { fieldOf } from '../../../shared/values/readers.mts';

const GRADLE_SETTINGS = ['settings.gradle', 'settings.gradle.kts'];
const ROOT_PROJECT_NAME = /rootProject\.name\s*=\s*["']([^"']+)["']/u;
const MAVEN_PARENT = /<parent>[\s\S]*?<\/parent>/u;
const MAVEN_ARTIFACT = /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/u;

const textInside: (root: string, file: string) => string = readTextInside;
const pyprojectOf: (directory: string) => unknown = readPyproject;

function textName(value: unknown): string[] {
  return typeof value === 'string' && value !== '' ? [value] : [];
}

function manifestOf(text: string): { readonly value: unknown } | { readonly malformed: true } {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { malformed: true };
  }
}

function packageName(directory: string): string[] {
  const text = textInside(directory, 'package.json');
  if (text === '') {
    return [];
  }
  const manifest = manifestOf(text);
  return 'malformed' in manifest ? [] : textName(fieldOf(manifest.value, 'name'));
}

function pythonName(directory: string): string[] {
  const pyproject = pyprojectOf(directory);
  return [
    ...textName(fieldOf(fieldOf(pyproject, 'project'), 'name')),
    ...textName(fieldOf(fieldOf(fieldOf(pyproject, 'tool'), 'poetry'), 'name')),
  ];
}

function mavenName(directory: string): string[] {
  const own = textInside(directory, 'pom.xml').replace(MAVEN_PARENT, '');
  return textName(MAVEN_ARTIFACT.exec(own)?.[1]);
}

function gradleName(directory: string): string[] {
  return GRADLE_SETTINGS.flatMap((file) =>
    textName(ROOT_PROJECT_NAME.exec(textInside(directory, file))?.[1]),
  );
}

export function projectNames(directory: string): string[] {
  return [
    ...new Set([
      ...packageName(directory),
      ...pythonName(directory),
      ...mavenName(directory),
      ...gradleName(directory),
    ]),
  ];
}
