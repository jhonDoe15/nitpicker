export const FIX_COMMAND = 'nitpicker --fix';

/** The ask of every formatter finding: `nitpicker --fix`, and `command` for a file it skips. */
export function formatAdvice(command) {
  return command === undefined
    ? `Run \`${FIX_COMMAND}\` to format the changed files; it skips a file that was already ` +
        'unformatted on the base, so format such lines by hand.'
    : `Run \`${FIX_COMMAND}\`, or format the file with \`${command} <file>\`.`;
}
