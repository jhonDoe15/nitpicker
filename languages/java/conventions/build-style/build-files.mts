import type { ConventionSource } from '../../../../core/conventions/typed/convention-types.mts';

export type BuildFile = { readonly file: string; readonly text: string } & (
  { readonly kind: 'xml' } | { readonly kind: 'toml' } | { readonly kind: 'code' }
);

const MAX_BUILD_FILES = 200;
const BUILD_FILE =
  /(?:^|\/)(?:(?:build|settings)\.gradle(?:\.kts)?|pom\.xml|[^/]*\.versions\.toml)$/u;
const LOGIC_FILE = /(?:^|\/)(?:buildSrc|build-logic)\/.*\.(?:gradle|gradle\.kts|kt|groovy)$/u;
const SKIPPED_DIRECTORY = /(?:^|\/)(?:node_modules|build|target|out|\.gradle|fixtures|testdata)\//u;
const SOURCE_DIRECTORY = /(?:^|\/)src\//u;

function buildFileKind(file: string): 'xml' | 'toml' | 'code' {
  if (file.endsWith('.xml')) {
    return 'xml';
  }
  return file.endsWith('.toml') ? 'toml' : 'code';
}

function isBuildFile(file: string): boolean {
  if (SKIPPED_DIRECTORY.test(file)) {
    return false;
  }
  return LOGIC_FILE.test(file) || (BUILD_FILE.test(file) && !SOURCE_DIRECTORY.test(file));
}

function depth(file: string): number {
  return file.split('/').length;
}

export function buildFiles(source: ConventionSource): { files: BuildFile[]; skipped: number } {
  const all = source
    .paths()
    .filter(isBuildFile)
    .sort((left, right) => depth(left) - depth(right) || left.localeCompare(right));
  const files = all.slice(0, MAX_BUILD_FILES);
  const texts = source.readMany(files);
  return {
    files: files.flatMap((file) => {
      const text = texts.get(file);
      return text === undefined ? [] : [{ file, kind: buildFileKind(file), text }];
    }),
    skipped: all.length - files.length,
  };
}
