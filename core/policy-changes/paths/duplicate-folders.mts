import {
  GO_DUPLICATE_GLOBS,
  GO_SKIPPED_FOLDERS,
  JVM_SKIPPED_FOLDERS,
  PYTHON_SKIPPED_FOLDERS,
  SCRIPT_SKIPPED_FOLDERS,
  skippedFolderGlobs as untypedSkippedFolderGlobs,
} from '../../tooling/jscpd/skipped-folders.mjs';
import scriptConfig from '../../../languages/typescript/preset/defaults/jscpd.json' with { type: 'json' };
import { NON_PRODUCTION_GLOBS as UNTYPED_NON_PRODUCTION_GLOBS } from '../../../languages/python/adapters/analysis/python-sources.mts';
import { skippedFoldersOf } from '../types/config-readers.mts';
import type { PolicyConfig } from '../types/policy-types.mts';

export type DuplicateExclusion = {
  readonly glob: string;
  readonly key: string;
  readonly permanent?: true;
};

const PYTHON = 'python';
const skippedFolderGlobs: (folders: readonly string[]) => string[] = untypedSkippedFolderGlobs;
const NON_PRODUCTION_GLOBS: readonly string[] = UNTYPED_NON_PRODUCTION_GLOBS;

function permanentGlobs(preset: string | undefined): readonly string[] {
  if (preset === 'java' || preset === 'kotlin') {
    return [];
  }
  if (preset === 'go') {
    return GO_DUPLICATE_GLOBS;
  }
  const defaults =
    preset === PYTHON
      ? skippedFolderGlobs(PYTHON_SKIPPED_FOLDERS)
      : SCRIPT_SKIPPED_FOLDERS.map((folder) => `${folder}/**`);
  const ignored = preset === PYTHON ? NON_PRODUCTION_GLOBS : scriptConfig.ignore;
  return ignored.filter((glob) => !defaults.includes(glob));
}

export function duplicateFolderExclusions(
  config: PolicyConfig,
  preset: string | undefined = config.preset,
): DuplicateExclusion[] {
  const configured = skippedFoldersOf(config);
  let globs: readonly string[];
  if (configured !== undefined) {
    globs = skippedFolderGlobs(configured);
  } else if (preset === 'java' || preset === 'kotlin') {
    globs = skippedFolderGlobs(JVM_SKIPPED_FOLDERS);
  } else if (preset === PYTHON) {
    globs = skippedFolderGlobs(PYTHON_SKIPPED_FOLDERS);
  } else if (preset === 'go') {
    globs = skippedFolderGlobs(GO_SKIPPED_FOLDERS);
  } else {
    globs = SCRIPT_SKIPPED_FOLDERS.map((folder) => `${folder}/**`);
  }
  return [
    ...globs.map((glob) => ({ glob, key: 'duplicates.skippedFolders' })),
    ...permanentGlobs(preset).map((glob) => ({
      glob,
      key: 'duplicates.skippedFolders',
      permanent: true,
    })),
  ];
}
