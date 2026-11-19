import { type EslintFinding, isFieldRecord } from '../typed/engine.mts';

function positionOf(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1;
}

const PROJECT_SETUP =
  /parserOptions|project service|tsconfig|not included in|allowDefaultProject/iu;

export function isFatal(message: unknown): boolean {
  return isFieldRecord(message) && message.fatal === true;
}

function fatalMessageOf(messages: readonly unknown[], context: string): unknown {
  const fatal = messages.find(isFatal);
  const text = isFieldRecord(fatal) ? fatal.message : undefined;
  if (typeof text === 'string' && PROJECT_SETUP.test(text)) {
    throw new Error(`${context} is fatal: ${text}`);
  }
  return fatal;
}

function unparsedFileNote({
  message,
  relativePath,
  analyzerName,
}: {
  readonly message: unknown;
  readonly relativePath: string;
  readonly analyzerName: string;
}): EslintFinding {
  const fields = isFieldRecord(message) ? message : {};
  const reason = typeof fields.message === 'string' ? fields.message : 'parse failed';
  return {
    tool: analyzerName,
    rule: 'unparsed-file',
    path: relativePath,
    identity: 'unparsed-file',
    message: [
      `${analyzerName} could not parse ${relativePath} (${reason}),`,
      'so it did not lint this file; the other files were linted.',
    ].join(' '),
    location: { line: positionOf(fields.line), column: positionOf(fields.column) },
    classification: 'descriptive',
  };
}

export function unparsedNotes({
  messages,
  context,
  relativePath,
  analyzerName,
}: {
  readonly messages: readonly unknown[];
  readonly context: string;
  readonly relativePath: string;
  readonly analyzerName: string;
}): { readonly finding: EslintFinding; readonly plan: undefined }[] {
  const fatal = fatalMessageOf(messages, context);
  return fatal === undefined
    ? []
    : [
        {
          finding: unparsedFileNote({ message: fatal, relativePath, analyzerName }),
          plan: undefined,
        },
      ];
}
