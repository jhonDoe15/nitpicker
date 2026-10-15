import { expect } from 'vitest';
export function expectedOutput82_19() {
  return [
    'lib/alpha/index.ts',
    'lib/alpha/internal.ts',
    'lib/live/assertion.ts',
    'lib/live/bypass.ts',
    'lib/live/dup-a.ts',
    'lib/live/dup-b.ts',
    'lib/live/format.ts',
    'lib/live/lint.ts',
    'lib/live/types.ts',
    'lib/live/unused.ts',
    'lib/live/uses-spec.ts',
  ];
}

export function expectedOutput161_21() {
  return [
    'lib/alpha/index.ts',
    'lib/alpha/internal.ts',
    'lib/live/assertion.ts',
    'lib/live/bypass.ts',
    'lib/live/dup-a.ts',
    'lib/live/dup-b.ts',
    'lib/live/format.ts',
    'lib/live/lint.ts',
    'lib/live/types.ts',
    'lib/live/unused.ts',
    'lib/live/uses-spec.ts',
    'spec/helper.ts',
  ];
}

export function expectedOutput162_21() {
  return [
    'lib/alpha/index.ts',
    'lib/alpha/internal.ts',
    'lib/live/assertion.ts',
    'lib/live/bypass.ts',
    'lib/live/dup-a.ts',
    'lib/live/dup-b.ts',
    'lib/live/format.ts',
    'lib/live/lint.ts',
    'lib/live/types.ts',
    'lib/live/unused.ts',
    'lib/live/uses-spec.ts',
    'spec/helper.ts',
  ];
}

export function expectedOutput184_29() {
  return ['.', 'lib/greet.ts'];
}

export function expectedOutput211_22() {
  return 'nitpicker: head: running 1 analyzer\nNitpicker quality snapshot\nStatus: violations\nEnforceable findings: 1\nDescriptive findings: 0\nTool errors: 0\n\nPer-tool counts:\ndependency-architecture: total=1 enforceable=1 descriptive=0\n\nEnforceable findings:\ndependency-architecture/no-production-to-test lib/live/uses-spec.ts lib/live/uses-spec.ts must not depend on spec/helper.ts\n';
}

export function expectedOutput226_29({ packageRoot }) {
  return [
    '--analyzer-name',
    '--config',
    '--pattern',
    '--policy-file',
    '--policy-root',
    '--project-root',
    '--tool-root',
    '/p',
    `${packageRoot}`,
    `${packageRoot}/languages/typescript/adapters/eslint-runner.mjs`,
    'eslint-lint',
    'languages/typescript/preset/defaults/eslint.config.mjs',
    'languages/typescript/preset/defaults/tsconfig.quality.json',
    'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    'lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  ];
}

export function expectedOutput227_29({ packageRoot }) {
  return [
    '--analyzer-name',
    '--config',
    '--pattern',
    '--policy-file',
    '--policy-root',
    '--project-root',
    '--tool-root',
    '/p',
    `${packageRoot}`,
    `${packageRoot}/languages/typescript/adapters/eslint-runner.mjs`,
    'eslint-lint',
    'languages/typescript/preset/defaults/eslint.config.mjs',
    'languages/typescript/preset/defaults/tsconfig.quality.json',
    'lib/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    'lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    'spec/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  ];
}

export function expectedOutput229_31() {
  return [
    '**/*.d.ts',
    '**/build/**',
    '**/coverage/**',
    '**/dist/**',
    '**/generated/**',
    '**/node_modules/**',
    '**/reports/**',
    '**/target/**',
    '.stryker-tmp/**',
    'lib/legacy/**',
    'spec/legacy/**',
  ];
}
