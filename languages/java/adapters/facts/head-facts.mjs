import { runGit } from '../../../../core/diff/git/repository/command.mjs';
import { readInside } from '../../../../shared/conventions/read-inside.mjs';
import { kotlinFormatterOf } from '../kotlin/kotlin-tools.mjs';
import { featureFaceMatcher } from '../spring-arch/contract-types.mjs';

const BUILD_FILE =
  /(?:^|\/)(?:pom\.xml|[^/]+\.gradle(?:\.kts)?|libs\.versions\.toml|[^/]+\.versions\.toml)$/u;
const SPRING = /org\.springframework\b/u;
const JVM_SOURCE = /\.(?:java|kt)$/u;
const COMMENTS = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?:^|[ \t])(?:\/\/|#)[^\n]*/gmu;

function projectFiles(projectRoot) {
  try {
    return runGit(projectRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
      .split('\0')
      .filter((file) => file.length > 0);
  } catch {
    return [];
  }
}

export function declaresSpring(projectRoot, files = projectFiles(projectRoot)) {
  return files
    .filter((file) => BUILD_FILE.test(file))
    .some((file) =>
      SPRING.test(readInside(projectRoot, file, 'utf8')?.replaceAll(COMMENTS, ' ') ?? ''),
    );
}

export function hasFeatureFolders(files, featureRoots) {
  const isFeatureFace = featureFaceMatcher({ featureRoots, modulePath: '' });
  return files.some((file) => JVM_SOURCE.test(file) && isFeatureFace(file));
}

export function javaHeadFacts(projectRoot, config) {
  const files = projectFiles(projectRoot);
  return {
    ...(declaresSpring(projectRoot, files) ? { spring: true } : {}),
    ...(hasFeatureFolders(files, config.layout?.featureRoots) ? { featureFolders: true } : {}),
    ...(config.preset === 'kotlin'
      ? { kotlin: { formatter: kotlinFormatterOf(projectRoot, config.kotlin?.formatter) } }
      : {}),
  };
}
