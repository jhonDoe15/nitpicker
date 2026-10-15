import { existsSync } from 'node:fs';
import path from 'node:path';
import { testRunnerFor } from '../current.mjs';

const VITEST_TYPES = 'vitest/globals';

function runnerTypes(runner, projectDirectory) {
  const hasJestTypes = existsSync(path.join(projectDirectory, 'node_modules/@types/jest'));
  return runner === 'jest' && hasJestTypes ? ['jest'] : [];
}

export function withTestRunnerTypes(text, projectDirectory) {
  const runner = testRunnerFor(projectDirectory);
  if (runner === 'vitest') {
    return text;
  }
  const config = JSON.parse(text);
  const types = [
    ...(config.compilerOptions.types ?? []).filter((type) => type !== VITEST_TYPES),
    ...runnerTypes(runner, projectDirectory),
  ];
  return `${JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, types } }, null, 2)}\n`;
}
