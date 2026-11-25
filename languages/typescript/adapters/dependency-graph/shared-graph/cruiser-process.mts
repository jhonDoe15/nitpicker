import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mts';
import { fieldsOf } from '../../../../../shared/values/readers.mts';

export type SkippedFile = { readonly file: string; readonly reason: string };
type TextOutput = { write(text: string): unknown };
type ParsedLine =
  { readonly kind: 'parsed'; readonly value: unknown } | { readonly kind: 'malformed-json' };

const STDERR_DESCRIPTOR = 2;

export const STDERR_OUTPUT: TextOutput = {
  write(text: string): void {
    writeFileSync(STDERR_DESCRIPTOR, text);
  },
};

export const SKIPPED_FILE_MARKER = 'nitpicker-dependency-cruiser-skipped-file ';

const REGISTER_HOOKS = checkoutModuleUrl(
  pathToFileURL(path.join(import.meta.dirname, '..', 'cruiser-hooks', 'register.mjs')),
).href;

export function cruiserNodeArguments(): string[] {
  return ['--import', REGISTER_HOOKS];
}

function parsedLine(text: string): ParsedLine {
  try {
    return { kind: 'parsed', value: JSON.parse(text) };
  } catch {
    return { kind: 'malformed-json' };
  }
}

function skippedFileOf(line: string): SkippedFile[] {
  if (!line.startsWith(SKIPPED_FILE_MARKER)) {
    return [];
  }
  const parsed = parsedLine(line.slice(SKIPPED_FILE_MARKER.length));
  if (parsed.kind === 'malformed-json') {
    return [];
  }
  const { file, reason } = fieldsOf(parsed.value);
  return typeof file === 'string' && typeof reason === 'string' ? [{ file, reason }] : [];
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
  output: TextOutput = STDERR_OUTPUT,
): void {
  const skipped = skippedFiles(stderr);
  const [first] = skipped;
  if (first === undefined) {
    return;
  }
  const modules = moduleCount();
  if (skipped.length * 2 > modules) {
    throw new Error(
      `dependency-cruiser could not read ${String(skipped.length)} of ${String(modules)} files; ` +
        `the first, ${first.file}: ${first.reason}`,
    );
  }
  for (const file of skipped.slice(0, LISTED_SKIPPED_FILES)) {
    output.write(skippedFileWarning(file));
  }
  if (skipped.length > LISTED_SKIPPED_FILES) {
    output.write(
      `dependency-cruiser could not read ${String(skipped.length - LISTED_SKIPPED_FILES)} more files\n`,
    );
  }
}
