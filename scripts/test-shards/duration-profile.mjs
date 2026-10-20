import path from 'node:path';

export function durationFile(environment = process.env) {
  const enabled = ['java', 'kotlin', 'python'].filter(
    (language) => environment[`NITPICKER_${language.toUpperCase()}_E2E`] === '1',
  );
  if (enabled.length > 1) {
    throw new Error('Record or run one language end-to-end suite at a time.');
  }
  const name = enabled.length === 0 ? 'durations' : `${enabled[0]}-e2e`;
  return path.join(import.meta.dirname, `${name}.json`);
}
