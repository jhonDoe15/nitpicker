import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runGit } from '../../../../core/diff/git/repository/command.mjs';
import { readInside } from '../../../../shared/conventions/read-inside.mjs';
import { detectJavaBuild } from '../../builds/java-build.mjs';
import { readEffectivePom } from '../../maven/configuration/effective-pom.mjs';
import { kotlinFormatterOf, mavenKotlinFacts } from '../kotlin/kotlin-tools.mjs';

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
  return {
    ...(declaresSpring(projectRoot) ? { spring: true } : {}),
    ...(config.preset === 'kotlin' ? { kotlin: kotlinFacts(projectRoot, config, host) } : {}),
  };
}
