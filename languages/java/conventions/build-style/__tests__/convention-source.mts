import type { ConventionSource } from '../../../../../core/conventions/typed/convention-types.mts';

export function sourceWith(files: Record<string, string>): ConventionSource {
  return {
    paths: () => Object.keys(files),
    readMany: (wanted: readonly string[]) =>
      new Map(
        wanted.flatMap((file): [string, string][] => {
          const text = files[file];
          return text === undefined ? [] : [[file, text]];
        }),
      ),
  };
}
