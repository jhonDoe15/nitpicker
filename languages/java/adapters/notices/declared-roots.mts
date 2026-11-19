import { existsSync } from 'node:fs';
import { runGit } from '../../../../core/diff/git/repository/command.mjs';
import { readBuildSources } from '../../builds/narrowing/build-sources.mts';

const BUILD_FILE = /(?:^|\/)(?:build\.gradle(?:\.kts)?|pom\.xml)$/u;

function buildFiles(projectRoot: string): string[] {
  return existsSync(projectRoot)
    ? runGit(projectRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
        .split('\0')
        .filter((file) => BUILD_FILE.test(file))
    : [];
}

export function declaredSourceRoots(projectRoot: string): string[] {
  return readBuildSources(projectRoot, buildFiles(projectRoot)).flatMap((entry) =>
    entry.type === 'roots' ? entry.roots : [],
  );
}
