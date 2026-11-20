import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mjs';

export type SkippedFile = { readonly file: string; readonly reason: string };
type TextOutput = { write(text: string): unknown };

export const SKIPPED_FILE_MARKER = 'nitpicker-dependency-cruiser-skipped-file ';

const REGISTER_HOOKS = checkoutModuleUrl(
  pathToFileURL(path.join(import.meta.dirname, '..', 'cruiser-hooks', 'register.mjs')),
).href;

export function cruiserNodeArguments(): string[] {
  return ['--import', REGISTER_HOOKS];
}

function skippedFileOf(line: string): SkippedFile[] {
  if (!line.startsWith(SKIPPED_FILE_MARKER)) return [];
  try {
    const value: unknown = JSON.parse(line.slice(SKIPPED_FILE_MARKER.length));
    if (typeof value !== 'object' || value === null) return [];
    const { file, reason } = value as Record<string, unknown>;
    return typeof file === 'string' && typeof reason === 'string' ? [{ file, reason }] : [];
  } catch {
    return [];
  }
}

export function skippedFiles(stderr: string): SkippedFile[] {
  return stderr.split(/\r?\n/u).flatMap(skippedFileOf);
}

const LISTED_SKIPPED_FILES = 20;

function skippedFileWarning({ file, reason }: SkippedFile): string {
  return `dependency-cruiser could not read ${file}, so the dependency graph leaves out its imports: ${reason}\n`;
}

export function reportSkippedFiles(
  stderr: string,
  moduleCount: () => number,
  output: TextOutput = process.stderr,
): void {
  const skipped = skippedFiles(stderr);
  const [first] = skipped;
  if (first === undefined) return;
  const modules = moduleCount();
  if (skipped.length * 2 > modules) {
    throw new Error(
      `dependency-cruiser could not read ${String(skipped.length)} of ${String(modules)} files; ` +
        `the first, ${first.file}: ${first.reason}`,
    );
  }
  for (const file of skipped.slice(0, LISTED_SKIPPED_FILES)) output.write(skippedFileWarning(file));
  if (skipped.length > LISTED_SKIPPED_FILES) {
    output.write(
      `dependency-cruiser could not read ${String(skipped.length - LISTED_SKIPPED_FILES)} more files\n`,
    );
  }
}
