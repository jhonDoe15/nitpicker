import type {
  Convention,
  DetectedEntry,
} from '../../../../../shared/conventions/convention-types.mts';
import { detectedFor } from '../../typed/convention-views.mts';

type Files = Readonly<Record<string, string>>;

function accepts(_definition: unknown, file: string): boolean {
  return !/\.test\.|^test\//u.test(file);
}

function contentsOf(files: Files, paths: readonly string[]): Map<string, string | undefined> {
  return new Map(paths.map((file) => [file, files[file]]));
}

export function detectorFor(convention: Convention): (files: Files) => DetectedEntry {
  return (files) => {
    const source = {
      paths: () => Object.keys(files),
      readMany: (paths: readonly string[]) => contentsOf(files, paths),
    };
    return detectedFor({ definitions: [convention], source, accepts }, convention.id);
  };
}
