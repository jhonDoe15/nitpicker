import { messageOf } from '../../../../../shared/values/readers.mts';

const UNPARSED_FILE_RULE = 'prettier/file-not-parsed';

type UnparsedFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: 'descriptive';
};

export type Formatted =
  { readonly formatted: string } | { readonly formatted?: undefined; readonly reason: string };

const SYNTAX_ERROR_LINE = /^\[error\] (?<file>.+?): SyntaxError: /u;
const ERROR_LINE = /^\[error\] /u;
const CODE_FRAME_LINE = /^\[error\] (?:>| ) *\d* \|/u;

function isSyntaxError(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && error.name === 'SyntaxError');
}

export async function formattedOrUnparsed(format: () => Promise<string>): Promise<Formatted> {
  try {
    return { formatted: await format() };
  } catch (error) {
    if (!isSyntaxError(error)) {
      throw error;
    }
    return { reason: messageOf(error).split('\n')[0] ?? '' };
  }
}

export function unparsedFileFinding(
  tool: string,
  relativePath: string,
  reason: string,
): UnparsedFinding {
  return {
    tool,
    rule: UNPARSED_FILE_RULE,
    path: relativePath,
    identity: 'file-not-parsed',
    message:
      `Prettier could not parse this file (${reason}), so its formatting was not checked; the other ` +
      'files were. If the file is not meant to parse, list it in .prettierignore.',
    classification: 'descriptive',
  };
}

export function unparsedFilesOf(errorOutput: string): string[] | undefined {
  const lines = errorOutput
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0 && !CODE_FRAME_LINE.test(line));
  const files = lines.flatMap((line) => {
    const file = SYNTAX_ERROR_LINE.exec(line)?.groups?.['file'];
    return file === undefined ? [] : [file];
  });
  const explained = lines.every((line) => !ERROR_LINE.test(line) || SYNTAX_ERROR_LINE.test(line));
  return explained && files.length > 0 ? files : undefined;
}
