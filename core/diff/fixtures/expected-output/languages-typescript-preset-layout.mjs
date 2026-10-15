import { expect } from 'vitest';
export function expectedOutput23_33({ root }) {
  return [`${root}/**/*`, 'test/**/*', 'tests/**/*', 'vitest*.ts'];
}

export function expectedOutput24_31({ root }) {
  return [`${root}/**/*`, 'stryker.vitest.config.ts', 'test/**/*', 'tests/**/*'];
}

export function expectedOutput31_25() {
  return ['src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];
}

export function expectedOutput32_23() {
  return [
    'src/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    'test/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    'tests/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  ];
}
