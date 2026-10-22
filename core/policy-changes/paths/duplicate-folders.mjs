import {
  JVM_SKIPPED_FOLDERS,
  PYTHON_SKIPPED_FOLDERS,
  SCRIPT_SKIPPED_FOLDERS,
  skippedFolderGlobs,
} from '../../tooling/jscpd/skipped-folders.mjs';
import scriptConfig from '../../../languages/typescript/preset/defaults/jscpd.json' with { type: 'json' };
import { NON_PRODUCTION_GLOBS } from '../../../languages/python/adapters/analysis/python-sources.mjs';

function permanentGlobs(preset) {
  if (preset === 'java' || preset === 'kotlin') {
    return [];
  }
  const defaults =
    preset === 'python'
      ? skippedFolderGlobs(PYTHON_SKIPPED_FOLDERS)
      : SCRIPT_SKIPPED_FOLDERS.map((folder) => `${folder}/**`);
  const ignored = preset === 'python' ? NON_PRODUCTION_GLOBS : scriptConfig.ignore;
  return ignored.filter((glob) => !defaults.includes(glob));
}

export function duplicateFolderExclusions(config, preset = config.preset) {
  const configured = config.duplicates?.skippedFolders;
  let globs;
  if (configured !== undefined) {
    globs = skippedFolderGlobs(configured);
  } else if (preset === 'java' || preset === 'kotlin') {
    globs = skippedFolderGlobs(JVM_SKIPPED_FOLDERS);
  } else if (preset === 'python') {
    globs = skippedFolderGlobs(PYTHON_SKIPPED_FOLDERS);
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
