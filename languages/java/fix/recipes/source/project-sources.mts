import path from 'node:path';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../../shared/project-files/project-files.mjs';
import { callUntyped } from '../../../adapters/typed/java-values.mts';
import { textsOf } from '../../../../../shared/values/readers.mts';
import { GENERATED } from '../logic/tree-fix-recipe.mts';
import { sourceOf, type Source } from './java-source.mts';

export type ProjectSources = {
  readonly sources: readonly Source[];
  readonly others: readonly { readonly path: string; readonly text: string }[];
};

const JAVA_FILE = /\.java$/u;
const OTHER_SOURCE = /\.(?:kt|kts|groovy|gradle)$/u;

export function projectSources(
  projectRoot: string,
  read: (name: string) => string | undefined,
): ProjectSources {
  const names = textsOf(callUntyped(untypedProjectFilesUnder, projectRoot))
    .map((file) => path.relative(projectRoot, file).split(path.sep).join('/'))
    .filter((name) => !GENERATED.test(name));
  const texts = names.flatMap((name) => {
    const text = read(name);
    return text === undefined ? [] : [{ path: name, text }];
  });
  return {
    sources: texts
      .filter(({ path: name }) => JAVA_FILE.test(name))
      .map((file) => sourceOf(file.path, file.text)),
    others: texts.filter(({ path: name }) => OTHER_SOURCE.test(name)),
  };
}

const CONFIGURED_TEXT = /\.(?:java|kt|kts|groovy|gradle|xml|ya?ml|properties)$/u;

export function projectTexts(
  projectRoot: string,
  read: (name: string) => string | undefined,
): { readonly path: string; readonly text: string }[] {
  return textsOf(callUntyped(untypedProjectFilesUnder, projectRoot))
    .map((file) => path.relative(projectRoot, file).split(path.sep).join('/'))
    .filter((name) => CONFIGURED_TEXT.test(name) && !GENERATED.test(name))
    .flatMap((name) => {
      const text = read(name);
      return text === undefined ? [] : [{ path: name, text }];
    });
}
