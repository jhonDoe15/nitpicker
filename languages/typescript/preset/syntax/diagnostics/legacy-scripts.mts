import type TypeScript from 'typescript';

const SCRIPT_SOURCE = /\.(?:c?js|jsx)$/iu;
const SLOPPY_MODE_CODES: ReadonlySet<number> = new Set([1121, 1487, 1488, 1489]);
const SLOPPY_MODE_MESSAGE = new RegExp(
  [
    'Octal literals are not allowed',
    'Octal escape sequences are not allowed',
    'Decimals with leading zeros are not allowed',
    String.raw`Escape sequence '\\[89]' is not allowed`,
  ].join('|'),
  'u',
);

export function isScriptSource(filename: string): boolean {
  return SCRIPT_SOURCE.test(filename);
}

export function isSloppyModeMessage(message: string): boolean {
  return SLOPPY_MODE_MESSAGE.test(message);
}

export function blockingParseDiagnostics<Diagnostic extends Pick<TypeScript.Diagnostic, 'code'>>(
  filename: string,
  diagnostics: readonly Diagnostic[],
): readonly Diagnostic[] {
  return isScriptSource(filename)
    ? diagnostics.filter(({ code }) => !SLOPPY_MODE_CODES.has(code))
    : diagnostics;
}
