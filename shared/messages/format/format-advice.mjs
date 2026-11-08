export const FIX_COMMAND = 'nitpicker --fix';

/** The ask of every formatter finding: `nitpicker --fix` where it formats the file, else `command`. */
export function formatAdvice(command) {
  return command === undefined
    ? `Run \`${FIX_COMMAND}\` to format the changed files.`
    : `Run \`${command} <file>\` to format the file.`;
}
