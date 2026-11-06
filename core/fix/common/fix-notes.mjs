function listed(paths, note) {
  return paths.length === 0 ? [] : [note(paths.join(', '))];
}

export function rewrittenNote(tool, paths) {
  return listed(paths, (names) => `${tool} rewrote ${names}`);
}

export function linkNote(paths) {
  return listed(paths, (names) => `--fix left ${names} as is: symbolic links are not followed`);
}

export function formatNotes(tool, outcome) {
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
    ...listed(undecodable, (names) => `--fix left ${names} as is: not UTF-8 text`),
    ...listed(
      changedMeanwhile,
      (names) => `--fix left ${names} as is: the file changed while --fix ran`,
    ),
  ];
}
