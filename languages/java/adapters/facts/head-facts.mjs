import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../../../core/diff/git/repository/command.mjs';
import { kotlinFormatterOf } from '../kotlin/kotlin-tools.mjs';

const BUILD_FILE =
  /(?:^|\/)(?:pom\.xml|[^/]+\.gradle(?:\.kts)?|libs\.versions\.toml|[^/]+\.versions\.toml)$/u;
const SPRING = /org\.springframework\b/u;
const COMMENTS = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?:^|[ \t])(?:\/\/|#)[^\n]*/gmu;

function buildFiles(projectRoot) {
  try {
    return runGit(projectRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
      .split('\0')
      .filter((file) => BUILD_FILE.test(file));
  } catch {
    return [];
  }
}

export function declaresSpring(projectRoot) {
  return buildFiles(projectRoot).some((file) => {
    const absolute = path.join(projectRoot, file);
    return (
      existsSync(absolute) && SPRING.test(readFileSync(absolute, 'utf8').replaceAll(COMMENTS, ' '))
    );
  });
}

export function javaHeadFacts(projectRoot, config) {
  return {
    ...(declaresSpring(projectRoot) ? { spring: true } : {}),
    ...(config.preset === 'kotlin'
      ? { kotlin: { formatter: kotlinFormatterOf(projectRoot, config.kotlin?.formatter) } }
      : {}),
  };
}
