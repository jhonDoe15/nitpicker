import { fileURLToPath, pathToFileURL } from 'node:url';
import { describeError } from '../error-chain.mjs';

const errorText: (error: unknown) => string = describeError;

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGE_URL = pathToFileURL(PACKAGE_ROOT).href;
const SHOWN_FRAMES = 6;
const FRAME = /^\s+at /u;

export const INTERNAL_ERROR_REPORT =
  '  This is a bug in nitpicker, not in the project. Please report it with the lines above: ' +
  'https://github.com/jhonDoe15/nitpicker/issues';

const ENGINE_MESSAGES = [
  /^Maximum call stack size exceeded$/u,
  /^Invalid (?:array|string|typed array) length$/u,
  /^Cannot (?:read|set) properties of (?:undefined|null)/u,
  /^Cannot (?:destructure|convert|access) /u,
  /^Assignment to constant variable\.$/u,
  /^Reduce of empty array with no initial value$/u,
  / is not (?:a function|a constructor|iterable|defined)\b/u,
];

function isInternalError(error: unknown): error is Error {
  const engineError =
    error instanceof RangeError || error instanceof TypeError || error instanceof ReferenceError;
  return engineError && ENGINE_MESSAGES.some((pattern) => pattern.test(error.message));
}

function shownFrame(line: string): string {
  return `  at ${line.replace(FRAME, '').replaceAll(PACKAGE_URL, '').replaceAll(PACKAGE_ROOT, '')}`;
}

function internalFrames(error: Error): string[] {
  const frames = (error.stack ?? '').split('\n').filter((line) => FRAME.test(line));
  return frames.slice(0, SHOWN_FRAMES).map(shownFrame);
}

export function withInternalFrames(text: string, error: unknown): string {
  return isInternalError(error)
    ? [text, ...internalFrames(error), INTERNAL_ERROR_REPORT].join('\n')
    : text;
}

export function describeFailure(error: unknown): string {
  return withInternalFrames(errorText(error), error);
}
