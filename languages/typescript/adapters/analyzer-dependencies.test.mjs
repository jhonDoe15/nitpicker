import { describe, expect, it } from 'vitest';
import { createEslintAnalyzer } from './eslint.mjs';
import { createStaticCheckAnalyzer } from './static-checks.mjs';

describe('analyzers that need the installed dependencies in the snapshot', () => {
  it('asks the run to link them once, so a finished analyzer cannot remove them under a running one', () => {
    const lint = createEslintAnalyzer({
      name: 'eslint-lint',
      configRelativePath: 'eslint.config.mjs',
    });
    const typecheck = createStaticCheckAnalyzer({
      name: 'typescript-typecheck',
      kind: 'typecheck',
      configRelativePath: 'tsconfig.quality.json',
    });

    expect(lint.requiresDependencies).toBe(true);
    expect(typecheck.requiresDependencies).toBe(true);
  });

  it('leaves formatting without them', () => {
    const format = createStaticCheckAnalyzer({
      name: 'prettier-format',
      kind: 'prettier',
      configRelativePath: '.prettierrc.json',
    });

    expect(format.requiresDependencies).toBe(false);
  });
});
