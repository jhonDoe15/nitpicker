import { outsideRootsNotice as untypedOutsideRootsNotice } from '../../../../shared/notices/outside-roots-message.mjs';
import { globMatcher as untypedGlobMatcher } from '../../../../shared/paths/glob.mjs';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

const outsideRootsNotice: (request: {
  readonly files: readonly string[];
  readonly kind: string;
  readonly where: string;
  readonly effect: string;
  readonly destination: string;
}) => string[] = untypedOutsideRootsNotice;
const globMatcher: (glob: string) => { readonly test: (file: string) => boolean } =
  untypedGlobMatcher;

const CONVENTIONAL_SOURCE_SET = /(?:^|\/)src\/[^/]+\/(?:java|kotlin)\//u;
const HIDDEN_FOLDER = /(?:^|\/)\.[^/]+\//u;
const BUILD_OUTPUT = /(?:^|\/)(?:build|target|out|node_modules)\//u;
const EXTENSIONS: Readonly<Record<string, RegExp>> = {
  java: /\.java$/u,
  kotlin: /\.(?:java|kt)$/u,
};
const KINDS: Readonly<Record<string, string>> = { java: 'Java', kotlin: 'Java or Kotlin' };

function isUnder(file: string, root: string): boolean {
  return file === root || file.startsWith(`${root}/`);
}

export function inJvmSourceSets(file: string, declaredRoots: readonly string[] = []): boolean {
  const normal = file.replaceAll('\\', '/');
  return (
    !HIDDEN_FOLDER.test(normal) &&
    !BUILD_OUTPUT.test(normal) &&
    (CONVENTIONAL_SOURCE_SET.test(normal) || declaredRoots.some((root) => isUnder(normal, root)))
  );
}

function outsideSourceSets(file: string, declaredRoots: readonly string[]): boolean {
  return !(
    HIDDEN_FOLDER.test(file) ||
    BUILD_OUTPUT.test(file) ||
    inJvmSourceSets(file, declaredRoots)
  );
}

export function jvmOutsideRootsNotices(changedFiles: Iterable<string>, project: object): string[] {
  const preset = textOf(fieldOf(project, 'preset'));
  const declaredRoots = textsOf(fieldOf(project, 'declaredRoots'));
  const excluded = textsOf(fieldOf(project, 'exclude')).map((glob) => globMatcher(glob));
  const outside = [...changedFiles]
    .map((file) => file.replaceAll('\\', '/'))
    .filter(
      (file) =>
        EXTENSIONS[preset]?.test(file) === true &&
        !excluded.some((matcher) => matcher.test(file)) &&
        outsideSourceSets(file, declaredRoots),
    );
  return outsideRootsNotice({
    files: outside,
    kind: KINDS[preset] ?? '',
    where: "the build's source sets",
    effect: 'so the build does not compile or check {them}',
    destination:
      'under src/main or src/test of a module, or declare {their} as a source directory in the build file',
  });
}
