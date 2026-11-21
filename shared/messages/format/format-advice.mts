export const FIX_COMMAND = 'nitpicker --fix';

export function formatAdvice(command?: string): string {
  return command === undefined
    ? `Run \`${FIX_COMMAND}\` to format the changed files; it skips a file that was already ` +
        'unformatted on the base, so format such lines by hand.'
    : `Run \`${FIX_COMMAND}\`, or format the file with \`${command} <file>\`.`;
}
