import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/main/composition-root.js';

const get = (url: string) => handleRequest({ method: 'GET', url });

describe('GET /greet', () => {
  it('greets the named person', () => {
    expect(get('/greet?name=Ada')).toEqual({ status: 200, body: 'Hello, Ada!\n' });
  });

  it('decodes and trims the name', () => {
    expect(get('/greet?name=%20Grace%20Hopper')).toEqual({
      status: 200,
      body: 'Hello, Grace Hopper!\n',
    });
  });

  it('greets every repeated name in order', () => {
    expect(get('/greet?name=Ada&name=Grace')).toEqual({
      status: 200,
      body: 'Hello, Ada!\nHello, Grace!\n',
    });
  });

  it('rejects a blank or missing name', () => {
    expect(get('/greet?name=%20')).toEqual({ status: 400, body: 'No name given\n' });
    expect(get('/greet?name=Ada&name=')).toEqual({ status: 400, body: 'No name given\n' });
    expect(get('/greet')).toEqual({ status: 400, body: 'No name given\n' });
  });
});

describe('other requests', () => {
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
