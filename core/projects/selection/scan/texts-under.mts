import { readFileSync } from 'node:fs';
import { filesUnder as untypedFilesUnder } from '../../../../shared/filesystem.mts';

const filesUnder: (
  root: string,
  options: {
    readonly skipDirectory: (absolute: string, entry: { readonly name: string }) => boolean;
  },
) => Iterable<string> = untypedFilesUnder;

export function textsUnder(
  directory: string,
  { skipped, accepts }: { readonly skipped: ReadonlySet<string>; readonly accepts: RegExp },
): string[] {
  const files = filesUnder(directory, {
    skipDirectory: (_absolute, entry) => entry.name.startsWith('.') || skipped.has(entry.name),
  });
  return [...files].filter((file) => accepts.test(file)).map((file) => readFileSync(file, 'utf8'));
}
