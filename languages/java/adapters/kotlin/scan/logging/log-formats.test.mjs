import { describe, expect, it } from 'vitest';
import { messageFormat, printfFormat, wrongConversion } from './log-formats.mjs';

describe('printfFormat', () => {
  it.each([
    ['cache %s has %d entries', 2],
    ['%1$s and %2$d, %1$s', 2],
    ['%s %<s %s', 2],
    ['100%% done%n', 0],
    ['%5% and %-5% wide', 0],
    ['%2$s then %s', 2],
    ['%-10s|%,d|%08.3f|%tY', 4],
  ])('counts %s as %i arguments', (text, required) => {
    const parsed = printfFormat(text);

    expect([parsed.malformed, parsed.required]).toEqual([false, required]);
  });

  it('reports a bare percent sign and an unknown conversion', () => {
    expect(printfFormat('cache at 100%').malformed).toBe(true);
    expect(printfFormat('cache %q').malformed).toBe(true);
    expect(printfFormat("cache '%' down").malformed).toBe(true);
  });

  it('pairs conversions with their arguments', () => {
    expect(printfFormat('%s %2$d %<x %f').conversions).toEqual([
      { argument: 1, conversion: 's' },
      { argument: 2, conversion: 'd' },
      { argument: 2, conversion: 'f' },
    ]);
  });

  it('sees MessageFormat and SLF4J placeholders', () => {
    expect(printfFormat('cache {0}').otherSyntax).toBe(true);
    expect(printfFormat('cache {}').otherSyntax).toBe(true);
    expect(printfFormat('cache {name}').otherSyntax).toBe(false);
  });
});

describe('messageFormat', () => {
  it.each([
    ['cache {0} has {1,number,#} entries', 2],
    ["cache {0} isn''t ready", 1],
    ["cache '{'{0}'}'", 1],
    ["Can't load {0}", 0],
    ['{0,choice,0#none|1#one|1<{0}}', 1],
    ['{2} only', 3],
  ])('counts %s as %i arguments', (text, required) => {
    expect(messageFormat(text).required).toBe(required);
  });

  it('reports an empty or named brace pair', () => {
    expect(messageFormat('cache {}').malformed).toBe(true);
    expect(messageFormat('cache {name}').malformed).toBe(true);
    expect(messageFormat('cache {0}').malformed).toBe(false);
    expect(messageFormat('cache { 0 }').malformed).toBe(true);
  });

  it('sees printf placeholders outside quotes', () => {
    expect(messageFormat('cache %s').otherSyntax).toBe(true);
    expect(messageFormat("cache '%s'").otherSyntax).toBe(false);
    expect(messageFormat('50% done').otherSyntax).toBe(false);
  });
});

describe('wrongConversion', () => {
  it.each([
    ['d', 'text', true],
    ['d', 'decimal', true],
    ['d', 'integral', false],
    ['f', 'integral', true],
    ['f', 'decimal', false],
    ['s', 'integral', false],
    ['d', undefined, false],
  ])('%s with %s is %s', (conversion, kind, wrong) => {
    expect(wrongConversion(conversion, kind)).toBe(wrong);
  });
});
