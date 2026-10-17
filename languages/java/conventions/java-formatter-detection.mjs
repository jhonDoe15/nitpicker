import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const BUILD_FILES = [
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradle/libs.versions.toml',
  'pom.xml',
];
const PALANTIR = /palantirjavaformat|palantir-java-format|com\.palantir\.java-format/;
const GOOGLE = /googlejavaformat|google-java-format|fmt-maven-plugin|com\.spotify\.fmt/;
const LINE_LENGTH_MODULE =
  /<module\s+name\s*=\s*"(?:[\w.]*\.)?LineLength(?:Check)?"\s*(\/>|>[\s\S]*?<\/module>)/;
const MAX_PROPERTY = /<property\s+name\s*=\s*"max"\s+value\s*=\s*"(\d+)"/;

function readIfExists(projectRoot, relative) {
  const absolute = path.join(projectRoot, relative);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

function withoutComments(text) {
  return text
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/(^|\s)\/\/.*$/gm, '$1');
}

export function declaredJavaFormatter(projectRoot) {
  const build = withoutComments(
    BUILD_FILES.map((file) => readIfExists(projectRoot, file)).join('\n'),
  ).toLowerCase();
  if (PALANTIR.test(build)) {
    return 'palantir';
  }
  return GOOGLE.test(build) ? 'google' : undefined;
}

export function checkstyleLineLength(text) {
  const module = LINE_LENGTH_MODULE.exec(withoutComments(text));
  return module === null ? undefined : MAX_PROPERTY.exec(module[1])?.[1];
}
