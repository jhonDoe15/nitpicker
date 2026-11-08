import { outsideRootsNotice } from '../../../../shared/notices/outside-roots-message.mjs';
import { globMatcher } from '../../../../shared/paths/glob.mjs';

const CONVENTIONAL_SOURCE_SET = /(?:^|\/)src\/[^/]+\/(?:java|kotlin)\//u;
const HIDDEN_FOLDER = /(?:^|\/)\.[^/]+\//u;
const BUILD_OUTPUT = /(?:^|\/)(?:build|target|out|node_modules)\//u;
const EXTENSIONS = { java: /\.java$/u, kotlin: /\.(?:java|kt)$/u };
const KINDS = { java: 'Java', kotlin: 'Java or Kotlin' };

function isUnder(file, root) {
  return file === root || file.startsWith(`${root}/`);
}

export function inJvmSourceSets(file, declaredRoots = []) {
  const normal = file.replaceAll('\\', '/');
  return (
    !HIDDEN_FOLDER.test(normal) &&
    !BUILD_OUTPUT.test(normal) &&
    (CONVENTIONAL_SOURCE_SET.test(normal) || declaredRoots.some((root) => isUnder(normal, root)))
  );
}

function outsideSourceSets(file, declaredRoots) {
  return (
    !HIDDEN_FOLDER.test(file) && !BUILD_OUTPUT.test(file) && !inJvmSourceSets(file, declaredRoots)
  );
}

export function jvmOutsideRootsNotices(changedFiles, project) {
  const { preset, declaredRoots = [], exclude = [] } = project;
  const excluded = exclude.map((glob) => globMatcher(glob));
  const outside = [...changedFiles]
    .map((file) => file.replaceAll('\\', '/'))
    .filter(
      (file) =>
        EXTENSIONS[preset].test(file) &&
        !excluded.some((matcher) => matcher.test(file)) &&
        outsideSourceSets(file, declaredRoots),
    );
  return outsideRootsNotice({
    files: outside,
    kind: KINDS[preset],
    where: "the build's source sets",
    effect: 'so the build does not compile or check {them}',
    destination:
      'under src/main or src/test of a module, or declare {their} as a source directory in the build file',
  });
}
