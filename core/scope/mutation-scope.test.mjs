import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { mutationScopeArguments, parseMutationScope } from '../tooling/runner-arguments.mjs';
import { isInMutationScope, outsideScopePatterns, scopedProjectFiles } from './mutation-scope.mjs';

const { createGitRepository } = useGitFixtures();

describe('parseMutationScope', () => {
  it('reads the paths that mutationScopeArguments writes', () => {
    const [option, value] = mutationScopeArguments(['src/orders', 'src/a.ts']);

    expect(option).toBe('--mutation-scope');
    expect(parseMutationScope(value)).toEqual(['src/orders', 'src/a.ts']);
    expect(mutationScopeArguments(undefined)).toEqual([]);
  });

  it.each(['{}', '[]', '[1]', '[""]', '["."]'])('rejects %s', (text) => {
    expect(() => parseMutationScope(text)).toThrow(
      '--mutation-scope must be a JSON array of project-relative paths',
    );
  });
});

describe('isInMutationScope', () => {
  it('keeps a file under a scope path and every file without a scope', () => {
    expect(isInMutationScope('src/orders/order.ts', ['src/orders'])).toBe(true);
    expect(isInMutationScope('src/orders-old/order.ts', ['src/orders'])).toBe(false);
    expect(isInMutationScope('src/a.ts', ['src/a.ts'])).toBe(true);
    expect(isInMutationScope('src/b.ts', undefined)).toBe(true);
  });
});

describe('outsideScopePatterns', () => {
  it('names the widest folders outside the scope and the files beside it', () => {
    const files = [
      'src/shop/orders/models.py',
      'src/shop/orders/sub/deep.py',
      'src/shop/billing/bill.py',
      'src/shop/billing/tax/rate.py',
      'src/shop/__init__.py',
      'src/app.py',
      'scripts/tool.py',
      'setup.py',
    ];

    expect(outsideScopePatterns(files, ['src/shop/orders'])).toEqual([
      'scripts/*',
      'setup.py',
      'src/app.py',
      'src/shop/__init__.py',
      'src/shop/billing/*',
    ]);
    expect(outsideScopePatterns(files, ['src/shop/orders/models.py'])).toEqual([
      'scripts/*',
      'setup.py',
      'src/app.py',
      'src/shop/__init__.py',
      'src/shop/billing/*',
      'src/shop/orders/sub/*',
    ]);
  });
});

describe('outsideScopePatterns with glob characters', () => {
  it('writes them as fnmatch literals', () => {
    expect(outsideScopePatterns(['src/[id]/a.py', 'src/b*.py', 'src/in/c.py'], ['src/in'])).toEqual(
      ['src/[[]id]/*', 'src/b[*].py'],
    );
  });
});

describe('scopedProjectFiles', () => {
  it('lists tracked and untracked files under the scope, not ignored ones', () => {
    const { root } = createGitRepository({
      '.gitignore': 'src/orders/ignored.ts\n',
      'src/orders/order.ts': '',
      'src/billing/bill.ts': '',
    });
    writeFileSync(path.join(root, 'src/orders/new.ts'), '');
    writeFileSync(path.join(root, 'src/orders/ignored.ts'), '');

    expect(scopedProjectFiles(root, ['src/orders'])).toEqual([
      'src/orders/new.ts',
      'src/orders/order.ts',
    ]);
  });
});
