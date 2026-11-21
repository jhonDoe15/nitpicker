import { existsSync } from 'node:fs';
import { runGit } from '../../../../core/diff/git/repository/command.mts';
import { readBuildSources } from '../../builds/narrowing/build-sources.mts';

const BUILD_FILE = /(?:^|\/)(?:build\.gradle(?:\.kts)?|pom\.xml)$/u;
const SKIPPED_BUILD_DIRECTORY = /(?:^|\/)(?:src|node_modules|build|target|out|\.gradle)\//u;
const SKIPPED_TEST_DIRECTORY =
  /(?:^|\/)(?:fixture|fixtures|__fixtures__|testdata|test|tests|__tests__|testFixtures)\//u;

function buildFiles(projectRoot: string): string[] {
  return existsSync(projectRoot)
    ? runGit(projectRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
        .split('\0')
        .filter(
          (file) =>
            BUILD_FILE.test(file) &&
            !SKIPPED_BUILD_DIRECTORY.test(file) &&
            !SKIPPED_TEST_DIRECTORY.test(file),
        )
    : [];
}

export function declaredSourceRoots(projectRoot: string): string[] {
  return readBuildSources(projectRoot, buildFiles(projectRoot)).flatMap((entry) =>
    entry.type === 'roots' ? entry.roots : [],
  );
}
