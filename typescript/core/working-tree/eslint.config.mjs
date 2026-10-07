import path from 'node:path';
import tseslint from 'typescript-eslint';
import baseConfig from '../../preset/defaults/eslint.config.mjs';

const toolRoot = path.resolve(import.meta.dirname, '../..');
const typedFiles = ['src/main/**/*.ts', 'tests/**/*.ts', 'vitest*.ts'];

export default [
  ...baseConfig,
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['**/*.{ts,mts,cts,tsx}'],
    ignores: typedFiles,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      parserOptions: {
        ...tseslint.configs.disableTypeChecked.languageOptions.parserOptions,
        tsconfigRootDir: toolRoot,
      },
    },
  },
  {
    files: ['vitest*.ts'],
    languageOptions: {
      parserOptions: {
        project: './preset/defaults/tsconfig.quality.json',
        tsconfigRootDir: toolRoot,
      },
    },
  },
];
