import path from 'node:path';

export function durationFile(environment = process.env) {
  const java = environment.NITPICKER_JAVA_E2E === '1';
  const kotlin = environment.NITPICKER_KOTLIN_E2E === '1';
  if (java && kotlin) {
    throw new Error('Record or run one JVM end-to-end suite at a time.');
  }
  const name = java ? 'java-e2e' : kotlin ? 'kotlin-e2e' : 'durations';
  return path.join(import.meta.dirname, `${name}.json`);
}
