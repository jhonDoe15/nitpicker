import { describe, expect, it } from 'vitest';
import { readsTainted, referencesIn } from './request-values.mjs';

const names = (text) => referencesIn(text).map(({ name, member }) => (member ? `${name}.` : name));

describe('referencesIn', () => {
  it('reads root names and marks a member read', () => {
    expect(names('template.getForObject(target.url, String::class.java)')).toEqual([
      'template.',
      'target.',
      'String',
    ]);
  });

  it('reads string template entries and skips the literal text', () => {
    expect(names('"https://$host/rates/{currency}?q=${query.trim()}"')).toEqual(['host', 'query.']);
    expect(names('"""raw $id and \\$x"""')).toEqual(['id', 'x']);
    expect(names('"escaped \\$x"')).toEqual([]);
  });

  it('skips named argument labels, numbers and the arguments of URI template calls', () => {
    expect(names('RedirectView(url = next, 10L)')).toEqual(['RedirectView', 'next']);
    expect(
      names('UriComponentsBuilder.fromUriString(BASE).path("/r/{c}").buildAndExpand(c)'),
    ).toEqual(['UriComponentsBuilder.', 'BASE']);
  });
});

describe('readsTainted', () => {
  const taint = new Map([
    ['url', 'direct'],
    ['target', 'member'],
  ]);

  it('counts a direct name anywhere and a parameter object only through a member', () => {
    expect(readsTainted('URI.create(url)', taint)).toBe(true);
    expect(readsTainted('"redirect:$url"', taint)).toBe(true);
    expect(readsTainted('target.url', taint)).toBe(true);
    expect(readsTainted('log(target)', taint)).toBe(false);
    expect(readsTainted('"$BASE/rates"', taint)).toBe(false);
    expect(readsTainted(undefined, taint)).toBe(false);
  });
});
