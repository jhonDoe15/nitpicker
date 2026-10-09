import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/main/composition-root.js';

const get = (url: string) => handleRequest({ method: 'GET', url });

describe('handleRequest', () => {
  it('greets the named person', () => {
    expect(get('/greet?name=Ada')).toEqual({ status: 200, body: 'Hello, Ada!\n' });
  });

  it('greets every repeated name in order', () => {
    expect(get('/greet?name=Ada&name=Grace')).toEqual({
      status: 200,
      body: 'Hello, Ada!\nHello, Grace!\n',
    });
  });

  it('rejects a blank name', () => {
    expect(get('/greet?name=%20')).toEqual({ status: 400, body: 'No name given\n' });
  });

  it('rejects a blank name among several', () => {
    expect(get('/greet?name=Ada&name=')).toEqual({ status: 400, body: 'No name given\n' });
  });

  it('rejects a missing name', () => {
    expect(get('/greet')).toEqual({ status: 400, body: 'No name given\n' });
  });

  it('answers 404 for another path', () => {
    expect(get('/other')).toEqual({ status: 404, body: 'Not found\n' });
  });

  it('answers 405 for a non-GET method on /greet', () => {
    expect(handleRequest({ method: 'POST', url: '/greet?name=Ada' })).toEqual({
      status: 405,
      body: 'Method not allowed\n',
    });
  });
});
