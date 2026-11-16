import type { FixFile } from '../../../core/fix/typed/fix-types.mts';
import {
  changedFiles,
  formatNotes,
  readBytes,
  rewriteFormatted,
  splitByEncoding,
  withFixedLineEndingsOf,
  writeTexts,
} from '../../../core/fix/typed/fix-views.mts';
import type { ToolContext } from '../adapters/typed/context/tool-context-types.mts';
import type { FormatterInfo, RunSettings, StepInput } from './typed/python-fix-types.mts';
import { failure } from '../adapters/execution/python-process.mts';
import { onlyUnparsableFiles } from '../adapters/python-tools.mts';
import {
  FORMAT_FAILURE_STATUS,
  formatStdinCommand,
  lintFixCommands,
  reviewFixCommands,
} from './python-fix-commands.mts';
import { reviewCodesSelected, selectedRuffCodes } from './review/review-rules.mts';
import type { commandRunner } from './python-fix-session.mts';

type Run = ReturnType<typeof commandRunner>;
type FormatResult = { formatted: Map<string, string>; unformattable: string[] };

const JUPYTER_MISSING = 'Jupyter dependencies are not installed';
const FORMATTERS: Record<string, FormatterInfo> = {
  ruff: { operation: 'ruff-format-fix', label: 'ruff format' },
  black: { operation: 'black-fix', label: 'black' },
};

export function formatterOf(formatter: string): FormatterInfo {
  return FORMATTERS[formatter] ?? { operation: '', label: '' };
}

function notebookNote(skipped: Set<string>): string[] {
  return skipped.size === 0
    ? []
    : [
        `black left ${[...skipped].join(', ')} as is: Black formats notebooks only with its jupyter extra (black[jupyter]) installed`,
      ];
}

function stdinFormatter(
  context: ToolContext,
  run: Run,
  skipped: Set<string>,
): (sources: Map<string, string>) => FormatResult {
  const { formatter } = context.project;
  const { operation } = formatterOf(formatter);
  return function format(sources: Map<string, string>): FormatResult {
    const formatted = new Map<string, string>();
    const unformattable: string[] = [];
    for (const [file, source] of sources) {
      const command = formatStdinCommand(context, file);
      const result = run({
        operation,
        command,
        acceptedStatuses: [0, FORMAT_FAILURE_STATUS[formatter] ?? 0],
        input: source,
      });
      if (result.status === 0 && result.stderr.includes(JUPYTER_MISSING)) {
        skipped.add(file);
      } else if (result.status === 0) {
        formatted.set(file, result.stdout);
      } else if (onlyUnparsableFiles(formatter, result)) {
        unformattable.push(file);
      } else {
        throw new Error(`${operation} failed: ${failure({ context, command, result }).message}`);
      }
    }
    return { formatted, unformattable };
  };
}

function lintCommands(
  context: ToolContext,
  selectedRules: readonly string[],
): (name: string) => string[][] {
  const safe = lintFixCommands(context, selectedRuffCodes(selectedRules));
  const review = reviewCodesSelected(selectedRules);
  const reviewCommand = review.length === 0 ? undefined : reviewFixCommands(context, review);
  return (name: string) =>
    reviewCommand === undefined ? [safe(name)] : [safe(name), reviewCommand(name)];
}

export function lintStep({ context, run, projectRoot, files, selectedRules, writer }: StepInput): {
  written: string[];
  notes: string[];
} {
  const decodable = splitByEncoding(projectRoot, files).files;
  const before = readBytes(projectRoot, decodable);
  const codes = selectedRuffCodes(selectedRules);
  if (selectedRules.length > 0 && codes.length === 0) {
    return { written: [], notes: [] };
  }
  const commandsFor = decodable.length === 0 ? undefined : lintCommands(context, selectedRules);
  const planned = decodable.flatMap(({ path: name }) => {
    const original = before.get(name)?.toString('utf8') ?? '';
    let source = original;
    for (const command of commandsFor?.(name) ?? []) {
      const result = run({
        operation: 'ruff-fix',
        command,
        acceptedStatuses: [0, 1],
        input: source,
      });
      source = result.status === 0 ? source : withFixedLineEndingsOf(source, result.stdout);
    }
    return source === original ? [] : [{ name, bytes: before.get(name), text: source }];
  });
  const { written, changedMeanwhile, unwritable } = writeTexts(writer, planned, 'ruff check --fix');
  return {
    written,
    notes: formatNotes('ruff check --fix', {
      rewritten: written,
      changedMeanwhile,
      unwritable,
      keptAsIs: [],
      unformattable: [],
    }),
  };
}

export function formatStep({ context, run, settings, files, mergeBaseSha }: StepInput): string[] {
  const { repositoryRoot, projectRoot } = settings;
  const skipped = new Set<string>();
  const outcome = rewriteFormatted({
    projectRoot,
    repositoryRoot,
    mergeBaseSha,
    files,
    format: stdinFormatter(context, run, skipped),
    writer: settings.writer,
    keepLineEndings: true,
    allFiles: settings.allFiles,
    tool: formatterOf(context.project.formatter).label,
  });
  return [
    ...formatNotes(formatterOf(context.project.formatter).label, outcome),
    ...notebookNote(skipped),
  ];
}

export function formattedFiles(
  {
    files,
    settings,
    projectRoot,
    before,
  }: {
    files: readonly FixFile[];
    settings: RunSettings;
    projectRoot: string;
    before: ReadonlyMap<string, Buffer>;
  },
  written: string[],
): readonly FixFile[] {
  return settings.selectedRules.length === 0
    ? files
    : files.filter(
        ({ path: name }) =>
          written.includes(name) || changedFiles(projectRoot, [{ path: name }], before).length > 0,
      );
}
