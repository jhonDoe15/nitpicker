import { runGreeting } from '../../greeting/index.js';

export type ApiRequest = { readonly method: string; readonly url: string };
export type ApiResponse = { readonly status: number; readonly body: string };

const BASE_URL = 'http://localhost';

function greet(names: readonly string[]): ApiResponse {
  if (names.length === 0 || names.some((name) => name.trim().length === 0)) {
    return { status: 400, body: 'No name given\n' };
  }
  const lines: string[] = [];
  runGreeting(names, { write: (text) => lines.push(text) });
  return { status: 200, body: lines.join('') };
}

export function handleRequest(request: ApiRequest): ApiResponse {
  const url = new URL(request.url, BASE_URL);
  if (url.pathname !== '/greet') {
    return { status: 404, body: 'Not found\n' };
  }
  if (request.method !== 'GET') {
    return { status: 405, body: 'Method not allowed\n' };
  }
  return greet(url.searchParams.getAll('name'));
}
