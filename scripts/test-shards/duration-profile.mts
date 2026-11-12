import path from 'node:path';

export type Environment = Readonly<Record<string, string | undefined>>;

export function durationFile(environment: Environment = process.env): string {
  const enabled = ['java', 'kotlin', 'python', 'go'].filter(
    (language) => environment[`NITPICKER_${language.toUpperCase()}_E2E`] === '1',
  );
  if (enabled.length > 1) {
    throw new Error('Record or run one language end-to-end suite at a time.');
  }
  const name = enabled[0] === undefined ? 'durations' : `${enabled[0]}-e2e`;
  return path.join(import.meta.dirname, `${name}.json`);
}
