import type { FormatNotesInput } from '../typed/command-types.mts';

function listed(paths: readonly string[], note: (names: string) => string): string[] {
  return paths.length === 0 ? [] : [note(paths.join(', '))];
}

function rewrittenNote(tool: string, paths: readonly string[]): string[] {
  return listed(paths, (names) => `${tool} rewrote ${names}`);
}

export function undecodableNote(paths: readonly string[]): string[] {
  return listed(paths, (names) => `--fix left ${names} as is: not UTF-8 text`);
}

export function linkNote(paths: readonly string[]): string[] {
  return listed(paths, (names) => `--fix left ${names} as is: symbolic links are not followed`);
}

export function formatNotes(tool: string, outcome: FormatNotesInput): string[] {
  const { partlyRewritten = [], changedMeanwhile = [], undecodable = [] } = outcome;
  return [
    ...rewrittenNote(tool, outcome.rewritten),
    ...listed(
      partlyRewritten,
      (names) =>
        `${tool} formatted only the code around your change in ${names}: the rest was already unformatted before your change`,
    ),
    ...listed(
      outcome.keptAsIs,
      (names) => `${tool} left ${names} as is: already unformatted before your change`,
    ),
    ...listed(outcome.unformattable, (names) => `${tool} could not parse ${names}`),
    ...undecodableNote(undecodable),
    ...listed(outcome.unwritable ?? [], (entries) => `--fix could not write ${entries}`),
    ...listed(
      changedMeanwhile,
      (names) => `--fix left ${names} as is: the file changed while --fix ran`,
    ),
  ];
}
