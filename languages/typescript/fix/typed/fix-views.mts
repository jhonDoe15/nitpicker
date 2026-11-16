import type { createQualityChecks } from '../../preset/quality-checks.mjs';
import { containedPath as untypedContainedPath } from '../../../../core/fix/common/contained-path.mjs';
import {
  fixerError as untypedFixerError,
  runFixCommand as untypedRunFixCommand,
} from '../../../../core/fix/common/fix-command.mjs';
import { formatNotes as untypedFormatNotes } from '../../../../core/fix/common/fix-notes.mjs';
import { withFixedLineEndingsOf as untypedWithFixedLineEndingsOf } from '../../../../core/fix/common/rewrite/line-endings.mjs';
import { writeTexts as untypedWriteTexts } from '../../../../core/fix/engine/write-texts.mjs';
import type { FixFile, FixSettings, FixWriter } from '../../../../core/fix/typed/fix-types.mts';

export type Layout = NonNullable<Parameters<typeof createQualityChecks>[0]>;

type CommandResult = { readonly stdout: string };

type FormatOutcome = {
  readonly rewritten: readonly string[];
  readonly changedMeanwhile: readonly string[];
  readonly unwritable?: readonly string[];
  readonly unformattable: readonly string[];
  readonly keptAsIs: readonly string[];
  readonly partlyRewritten?: readonly string[];
  readonly undecodable?: readonly string[];
};

type PlannedText = {
  readonly name: string;
  readonly bytes: Buffer | undefined;
  readonly text: string;
};

export const containedPath: (root: string, name: string) => string = untypedContainedPath;

export const fixerError: (tool: string, error: unknown) => unknown = untypedFixerError;

export const runFixCommand: (command: {
  readonly operation: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly acceptedStatuses: readonly number[];
  readonly environment: NodeJS.ProcessEnv;
  readonly input: string | undefined;
  readonly executeFixCommand: FixSettings['executeFixCommand'];
}) => CommandResult = untypedRunFixCommand;

export const formatNotes: (tool: string, outcome: FormatOutcome) => string[] = untypedFormatNotes;

export const withFixedLineEndingsOf: (source: string, fixed: string) => string =
  untypedWithFixedLineEndingsOf;

export const writeTexts: (
  writer: FixWriter,
  planned: readonly PlannedText[],
  tool: string,
) => {
  readonly written: string[];
  readonly changedMeanwhile: string[];
  readonly unwritable: string[];
} = untypedWriteTexts;
