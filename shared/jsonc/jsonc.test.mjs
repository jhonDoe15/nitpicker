import { describe, expect, it } from 'vitest';
import { parseJsonc } from './jsonc.mjs';

describe('parsing JSON with comments', () => {
  it('drops line and block comments and trailing commas', () => {
    const text = '{\n  // a\n  "a": 1, /* b */ "b": [1, 2,],\n}\n';

    expect(parseJsonc(text)).toEqual({ a: 1, b: [1, 2] });
  });

  it('keeps comment markers and commas inside strings', () => {
    const text = '{ "url": "http://x/*y*/", "q": "a,]\\"//", }';

    expect(parseJsonc(text)).toEqual({ url: 'http://x/*y*/', q: 'a,]"//' });
  });

  it('reads plain JSON and a byte order mark', () => {
    expect(parseJsonc('﻿{"a": {"b": null}}')).toEqual({ a: { b: null } });
  });

  it('tolerates an unterminated comment', () => {
    expect(parseJsonc('{"a": 1} /* open')).toEqual({ a: 1 });
  });

  it('still rejects broken JSON', () => {
    expect(() => parseJsonc('{"a": }')).toThrow(SyntaxError);
  });
});
