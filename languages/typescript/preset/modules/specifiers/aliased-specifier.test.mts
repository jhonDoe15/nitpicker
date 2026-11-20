import { describe, expect, it } from 'vitest';
import { aliasedSpecifier } from './aliased-specifier.mts';

describe('aliasedSpecifier', () => {
  it('replaces a string alias and the folders under it', () => {
    const aliases = [{ find: '@app', replacement: '/src' }];

    expect(aliasedSpecifier(aliases, '@app/main')).toBe('/src/main');
    expect(aliasedSpecifier(aliases, '@application')).toBe('@application');
  });

  it.each([
    {
      name: 'capture groups',
      find: /^~(.*)\/(.*)$/u,
      replacement: '/src/$1/$2',
      specifier: '~ui/button',
    },
    {
      name: 'the match and the text around it',
      find: /lib/u,
      replacement: "[$&|$`|$'|$$]",
      specifier: 'a/lib/b',
    },
    {
      name: 'a two-digit reference past the last group',
      find: /^(x)$/u,
      replacement: '$10-$2-$0',
      specifier: 'x',
    },
    {
      name: 'scoped packages',
      find: /^(@[^/]+)\/(.*)$/u,
      replacement: 'packages/$1/src/$2',
      specifier: '@scope/a/b',
    },
  ])('expands $name as String.replace does', ({ find, replacement, specifier }) => {
    expect(aliasedSpecifier([{ find, replacement }], specifier)).toBe(
      specifier.replace(find, replacement),
    );
  });
});
