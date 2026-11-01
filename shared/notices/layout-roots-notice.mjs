import { globMatcher } from '../paths/glob.mjs';

const ROOT_EFFECTS = {
  featureRoots: 'it adds no feature folder for the feature folder rules to check',
  sharedRoots: 'it marks no code as shared for the feature folder rules',
};

export const LAYOUT_ROOT_KEYS = Object.keys(ROOT_EFFECTS);

function projectFolders(files) {
  return new Set(
    files.flatMap((file) => {
      const parts = file.split('/').slice(0, -1);
      return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
    }),
  );
}

function unmatchedGlobs(globs, folders) {
  return globs.filter((glob) => {
    const matcher = globMatcher(glob);
    return ![...folders].some((folder) => matcher.test(folder));
  });
}

export function unmatchedLayoutRootNotices(layout, files) {
  const folders = projectFolders(files);
  return LAYOUT_ROOT_KEYS.flatMap((key) =>
    unmatchedGlobs(layout?.[key] ?? [], folders).map(
      (glob) =>
        `"layout.${key}" entry "${glob}" matches no folder in the project: ${ROOT_EFFECTS[key]}. Point the glob at an existing folder, or remove it from nitpicker.config.json.`,
    ),
  );
}
