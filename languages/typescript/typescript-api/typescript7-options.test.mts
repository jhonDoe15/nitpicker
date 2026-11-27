import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseUrlPaths, optionOverrides } from './typescript7-options.mts';

const BASE = path.resolve('/project/src');
const absolute = (target: string) => path.resolve(BASE, target).replaceAll('\\', '/');

describe('the options TypeScript 7 removed', () => {
  it('raises the target and drops the removed options of a config without a base URL', () => {
    expect(optionOverrides({ target: 1, downlevelIteration: true })).toEqual({
      set: { target: 'ES2015' },
      unset: ['downlevelIteration'],
    });
  });

  it('drops the base URL and the removed options and keeps the target', () => {
    expect(optionOverrides({ baseUrl: BASE, esModuleInterop: false })).toEqual({
      set: { paths: { '*': [absolute('*')] } },
      unset: ['baseUrl', 'esModuleInterop'],
    });
  });

  it('keeps nothing for a config TypeScript 7 reads as it is', () => {
    expect(optionOverrides({ strict: true })).toBeUndefined();
  });

  it('maps the paths of a base URL onto absolute targets with a bare lookup', () => {
    expect(
      baseUrlPaths({ baseUrl: BASE, paths: { '@app/*': ['app/*'], '*': ['types/*'] } }),
    ).toEqual({
      paths: { '@app/*': [absolute('app/*')], '*': [absolute('types/*'), absolute('*')] },
    });
  });

  it.each([
    ['a catch-all that is not a list', { '*': 'types/*' }, { paths: { '*': 'types/*' } }],
    ['paths that are not a map', 'paths', {}],
    [
      'a target that is not text',
      { '@app/*': [1] },
      { paths: { '@app/*': [1], '*': [absolute('*')] } },
    ],
  ])('keeps %s as it is', (_name, paths, expected) => {
    expect(baseUrlPaths({ baseUrl: BASE, paths: paths as never })).toEqual(expected);
  });
});
