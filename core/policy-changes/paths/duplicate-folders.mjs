import {
  JVM_SKIPPED_FOLDERS,
  PYTHON_SKIPPED_FOLDERS,
  SCRIPT_SKIPPED_FOLDERS,
  skippedFolderGlobs,
} from '../../tooling/jscpd/skipped-folders.mjs';

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
  return globs.map((glob) => ({ glob, key: 'duplicates.skippedFolders' }));
}
