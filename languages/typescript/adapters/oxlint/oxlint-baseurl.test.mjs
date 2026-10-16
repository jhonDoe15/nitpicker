import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createProject, lintProject, TYPED_POLICY } from './test-support/oxlint-project.mjs';

const CONSUMER = [
  'import { value } from "@/dep";',
  'export const needed = value as string;',
  'export const redundant = value as string | null;',
  '',
].join('\n');
const PINNED_OPTIONS = { types: [], lib: ['ES2022'] };

const PROJECTS = [
  { name: 'paths without a leading ./', target: 'src/*' },
  { name: 'paths with a leading ./', target: './src/*' },
];

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('lintWithOxlint with tsconfig baseUrl', () => {
  it.each(PROJECTS)('resolves aliases for $name', ({ target }) => {
    const root = createProject('nitpicker-oxlint-baseurl-test-', {
      'policy.mjs': TYPED_POLICY,
      'tsconfig.json': JSON.stringify({
        compilerOptions: { ...PINNED_OPTIONS, baseUrl: '.', paths: { '@/*': [target] } },
      }),
      'tsconfig.nitpicker.json': JSON.stringify({
        extends: './tsconfig.json',
        compilerOptions: { strict: true, skipLibCheck: true, types: [], lib: ['ES2022'] },
        include: ['src/**/*.ts'],
      }),
      'src/dep.ts': 'export declare const value: string | null;\n',
      'src/consumer.ts': CONSUMER,
    });
    roots.push(root);

    const results = lintProject({
      root,
      patterns: ['src/consumer.ts'],
      projectConfigName: 'tsconfig.nitpicker.json',
    });

    expect(
      results.flatMap((result) => result.messages.map(({ ruleId, line }) => ({ ruleId, line }))),
    ).toEqual([{ ruleId: '@typescript-eslint/no-unnecessary-type-assertion', line: 3 }]);
    expect(results.map((result) => path.basename(result.filePath))).toEqual(['consumer.ts']);
  });
});
