export {
  declaredConfigFiles,
  declaredToolChoices,
  declaredToolDigest,
  declaredToolNotices,
} from '../declared-choices.mts';
export { directorySource, readDeclaredBuild } from '../declared-build.mts';
export {
  ERRORPRONE,
  errorproneDeclarations,
  errorproneLayers,
} from '../errorprone/errorprone-declared.mts';
export { PIT, pitArguments, pitDeclarations, pitLayers } from '../pit-declared.mts';
export { spotbugsArguments, spotbugsDeclarations, spotbugsLayers } from '../spotbugs-declared.mts';
export { TESTS, testRetryDeclarations, testRetryValues } from '../test-retries-declared.mts';
export type { BuildSource } from '../declared-types.mts';

import type { BuildSource } from '../declared-types.mts';

export function sourceOf(files: Readonly<Record<string, string>>): BuildSource {
  return {
    paths: () => Object.keys(files),
    readMany: (wanted) =>
      new Map(wanted.filter((file) => file in files).map((file) => [file, files[file] ?? ''])),
  };
}
