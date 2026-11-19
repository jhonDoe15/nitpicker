import { describe, expect, it } from 'vitest';
import { decode, encode } from './host-wire.mts';

describe('the host wire format', () => {
  it('decodes the frames of a request it encoded, and says how many bytes they used', () => {
    const request = ['run', 'warm', 'päckage.Main', ''];

    expect(decode(encode(request))).toEqual({
      frames: request.map((text) => Buffer.from(text, 'utf8')),
      used: encode(request).length,
    });
  });

  it.each([[0], [3], [9]])('waits for more bytes when only %i bytes arrived', (length) => {
    expect(decode(encode(['abc', 'def']).subarray(0, length))).toBeUndefined();
  });
});
