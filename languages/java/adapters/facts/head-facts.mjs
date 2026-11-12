import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readInside } from '../../../../shared/conventions/read-inside.mjs';
import { projectFilePaths } from '../../../../shared/project-files/project-files.mjs';
import { detectJavaBuild } from '../../builds/java-build.mjs';
import { readEffectivePom } from '../../maven/configuration/effective-pom.mjs';
import { kotlinFormatterOf, mavenKotlinFacts } from '../kotlin/kotlin-tools.mjs';
import { featureFaceMatcher } from '../spring-arch/contract-types.mjs';
import { springRolesFact } from '../spring-arch/spring-roles.mjs';

const BUILD_FILE = /(?:^|\/)(?:pom\.xml|[^/]+\.gradle(?:\.kts)?|[^/]+\.versions\.toml)$/u;
const SPRING = /org\.springframework\b/u;
const MAIN_SOURCE = /(?:^|\/)src\/main\/(?:java|kotlin)\/.+\.(?:java|kt)$/u;
const COMMENTS = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?:^|[ \t])(?:\/\/|#)[^\n]*/gmu;

export function declaresSpring(projectRoot, files = projectFilePaths(projectRoot)) {
  return files
    .filter((file) => BUILD_FILE.test(file))
    .some((file) =>
      SPRING.test(readInside(projectRoot, file, 'utf8')?.replaceAll(COMMENTS, ' ') ?? ''),
    );
}

export function hasFeatureFolders(files, layout) {
  const isFeatureFace = featureFaceMatcher({ layout, modulePath: '' });
  return files.some((file) => MAIN_SOURCE.test(file) && isFeatureFace(file));
}

function effectivePomOf(projectRoot, { maven, spawn }) {
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-head-pom-'));
  try {
    return { text: readEffectivePom({ projectRoot, maven, work, spawn }) };
  } catch (error) {
    return { failure: error.message };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function kotlinFacts(projectRoot, config, host) {
  const configured = config.kotlin?.formatter;
  const { text: effectivePom } =
    detectJavaBuild(projectRoot) === 'maven' ? effectivePomOf(projectRoot, host) : {};
  return effectivePom === undefined
    ? { formatter: kotlinFormatterOf(projectRoot, configured) }
    : mavenKotlinFacts(projectRoot, configured, effectivePom);
}

export function javaHeadFacts(projectRoot, config, host = {}) {
  const files = projectFilePaths(projectRoot);
  return {
    ...(declaresSpring(projectRoot, files) ? { spring: true } : {}),
    ...(hasFeatureFolders(files, config.layout) ? { featureFolders: true } : {}),
    ...springRolesFact(config),
    ...(config.preset === 'kotlin' ? { kotlin: kotlinFacts(projectRoot, config, host) } : {}),
  };
}
