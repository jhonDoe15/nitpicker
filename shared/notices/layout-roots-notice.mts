import { globMatcher } from '../paths/glob.mts';
import { fieldOf, textsOf } from '../values/readers.mts';

const ROOT_EFFECTS: Readonly<Record<string, string>> = {
  featureRoots: 'it adds no feature folder for the feature folder rules to check',
  sharedRoots: 'it marks no code as shared for the feature folder rules',
};

export const LAYOUT_ROOT_KEYS: string[] = Object.keys(ROOT_EFFECTS);

function projectFolders(files: readonly string[]): Set<string> {
  return new Set(
    files.flatMap((file) => {
      const parts = file.split('/').slice(0, -1);
      return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
    }),
  );
}

function unmatchedGlobs(globs: readonly string[], folders: ReadonlySet<string>): string[] {
  return globs.filter((glob) => {
    const matcher = globMatcher(glob);
    return ![...folders].some((folder) => matcher.test(folder));
  });
}

export function unmatchedLayoutRootNotices(layout: unknown, files: unknown): string[] {
  const folders = projectFolders(textsOf(files));
  return Object.entries(ROOT_EFFECTS).flatMap(([key, effect]) =>
    unmatchedGlobs(textsOf(fieldOf(layout, key)), folders).map(
      (glob) =>
        `"layout.${key}" entry "${glob}" matches no folder in the project: ${effect}. Point the glob at an existing folder, or remove it from nitpicker.config.json.`,
    ),
  );
}
