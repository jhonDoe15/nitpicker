import { runGit } from '../../../../core/diff/git/repository/command.mjs';
import { readInside } from '../../../../shared/conventions/read-inside.mjs';
import { kotlinFormatterOf } from '../kotlin/kotlin-tools.mjs';

const BUILD_FILE =
  /(?:^|\/)(?:pom\.xml|[^/]+\.gradle(?:\.kts)?|libs\.versions\.toml|[^/]+\.versions\.toml)$/u;
const SPRING = /org\.springframework\b/u;
const COMMENTS = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?:^|[ \t])(?:\/\/|#)[^\n]*/gmu;

function buildFiles(projectRoot) {
  try {
    return {
      files: runGit(projectRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
        .split('\0')
        .filter((file) => BUILD_FILE.test(file)),
    };
  } catch {
    return { files: [] };
  }
}

export function declaresSpring(projectRoot) {
  return buildFiles(projectRoot).files.some((file) =>
    SPRING.test(readInside(projectRoot, file, 'utf8')?.replaceAll(COMMENTS, ' ') ?? ''),
  );
}

export function javaHeadFacts(projectRoot, config) {
  return {
    ...(declaresSpring(projectRoot) ? { spring: true } : {}),
    ...(config.preset === 'kotlin'
      ? { kotlin: { formatter: kotlinFormatterOf(projectRoot, config.kotlin?.formatter) } }
      : {}),
  };
}
