import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/main/composition-root.js';

const get = (url: string) => handleRequest({ method: 'GET', url });

describe('handleRequest', () => {
  it.each([
    {
      name: 'greets the named person',
      url: '/greet?name=Ada',
      expected: { status: 200, body: 'Hello, Ada!\n' },
    },
    {
      name: 'greets every repeated name in order',
      url: '/greet?name=Ada&name=Grace',
      expected: { status: 200, body: 'Hello, Ada!\nHello, Grace!\n' },
    },
    {
      name: 'rejects a blank name',
      url: '/greet?name=%20',
      expected: { status: 400, body: 'No name given\n' },
    },
    {
      name: 'rejects a blank name among several',
      url: '/greet?name=Ada&name=',
      expected: { status: 400, body: 'No name given\n' },
    },
    {
      name: 'rejects a missing name',
      url: '/greet',
      expected: { status: 400, body: 'No name given\n' },
    },
    {
      name: 'answers 404 for another path',
      url: '/other',
      expected: { status: 404, body: 'Not found\n' },
    },
  ])('$name', ({ url, expected }) => {
    expect(get(url)).toEqual(expected);
  });

  it('answers 405 for a non-GET method on /greet', () => {
    expect(handleRequest({ method: 'POST', url: '/greet?name=Ada' })).toEqual({
      status: 405,
      body: 'Method not allowed\n',
    });
  });
});
