import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-unhandled-url-parse.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'unhandledUrlParse' }] };
}

function decodeFlagged(code: string) {
  return { code, errors: [{ messageId: 'unhandledDecode' }] };
}

tester.run('no-unhandled-url-parse', rule, {
  valid: [
    'export const name = decodeURIComponent("a%20b");',
    'const PART = "a%20b"; export const name = decodeURI(PART);',
    'export function round(text: string) { return decodeURIComponent(encodeURIComponent(text)); }',
    'export const names = values.map(decodeURIComponent);',
    'export function decode(text: string) { return text; }',
    'export function safe(text: string) { try { return decodeURIComponent(text); } catch { return text; } }',
    'export function safe(texts: string[]) { try { return texts.map((text) => decodeURI(text)); } catch ' +
      '{ return texts; } }',
    'export function other(text: string) { return text.decodeURIComponent(text); }',
    'export const later = (text: string) => load().then(() => decodeURI(text)).catch(() => text);',
    'export const both = (text: string) => load().then(() => decodeURI(text), () => text);',
    'export const plain = (text: string) => (/%/.test(text) ? decodeURIComponent(text) : text);',
    'export const home = new URL("https://shop.example/");',
    'export const home = new URL(`https://shop.example/`);',
    'const BASE = "https://shop.example"; export const help = new URL(BASE + "/help");',
    'const BASE = "https://shop.example"; export const help = new URL(`${BASE}/help`);',
    'export const page = new URL("./page.html", import.meta.url);',
    'export function file(name: string) { return new URL(name, import.meta.url); }',
    'export function copy(url: URL) { return new URL(url.href); }',
    'export function search(request: Request) { return new URL(request.url).searchParams; }',
    'export function parse(text: string) { return URL.parse(text); }',
    'export function parse(text: string) { return URL.canParse(text) ? new URL(text) : undefined; }',
    'export function parse(text: string) { if (!URL.canParse(text)) { return undefined; } return new URL(text); }',
    [
      'export function parse(text: string) {',
      '  try {',
      '    return new URL(text);',
      '  } catch (error) {',
      '    return { kind: "invalid-url", error };',
      '  }',
      '}',
    ].join('\n'),
    [
      'export function parse(texts: string[]) {',
      '  try {',
      '    return texts.map((text) => new URL(text));',
      '  } catch (error) {',
      '    return { kind: "invalid-url", error };',
      '  }',
      '}',
    ].join('\n'),
    'class URLish {} export function make(text: string) { return new URLish(text); }',
    'export function copy(url: URL) { return new URL(url); }',
    'export function api(base: URL) { return new URL("/api", base); }',
    'const ROOT = new URL("../", import.meta.url); export function file(name: string) { return new URL(name, ROOT); }',
    'export function page(path: string) { return new URL("/x", window.location.origin); }',
    'export function parse(text?: string) { if (!text || !URL.canParse(text)) { return undefined; } return ' +
      'new URL(text!); }',
    `const A = "a"; export const long = new URL(${'A + '.repeat(30)}"https://a");`,
  ],
  invalid: [
    decodeFlagged('export const later = (text: string) => load().then(() => decodeURI(text));'),
    decodeFlagged(
      'export const other = (text: string) => (/%/.test(text) ? 1 : decodeURI(other));',
    ),
    decodeFlagged('export function name(text: string) { return decodeURIComponent(text); }'),
    decodeFlagged('export function path(pathname: string) { return decodeURI(pathname); }'),
    decodeFlagged(
      'export function name(text: string) { return globalThis.decodeURIComponent(text); }',
    ),
    decodeFlagged('export function name(req: Req) { return decodeURIComponent(req.params.name); }'),
    decodeFlagged('export function name(text: string) { return decodeURIComponent(`a/${text}`); }'),
    decodeFlagged(
      'export function parts(texts: string[]) { return texts.map((text) => decodeURIComponent(text)); }',
    ),
    decodeFlagged(
      [
        'export function name(text: string) {',
        '  try {',
        '    return 1;',
        '  } catch {',
        '    return decodeURIComponent(text);',
        '  }',
        '}',
      ].join('\n'),
    ),
    decodeFlagged(
      [
        'export function name(text: string) {',
        '  try {',
        '    return function later() { return decodeURIComponent(text); };',
        '  } catch (error) {',
        '    return error;',
        '  }',
        '}',
      ].join('\n'),
    ),
    flagged('export function parse(text: string) { return new URL(text); }'),
    flagged(
      'export function parse(path: string) { return new URL(`https://shop.example/${path}`); }',
    ),
    flagged(
      'export function parse(path: string) { return new URL("https://shop.example/" + path); }',
    ),
    flagged('export function local(path: string) { return new URL(path, "http://localhost"); }'),
    flagged('export const configured = new URL(process.env.API_URL ?? "");'),
    flagged('export const api = new URL("/api", process.env.API_BASE);'),
    flagged('export function api(base: string) { return new URL("/api", base); }'),
    flagged('export function parse(text: string) { return new globalThis.URL(text); }'),
    flagged(
      'export function parse(text: string) { return URL.canParse(other) ? new URL(text) : undefined; }',
    ),
    flagged(
      [
        'export function parse(text: string) {',
        '  try {',
        '    return new URL("https://shop.example/");',
        '  } catch (error) {',
        '    return new URL(text);',
        '  }',
        '}',
      ].join('\n'),
    ),
    flagged(
      [
        'export function parse(text: string) {',
        '  try {',
        '    return function later() { return new URL(text); };',
        '  } catch (error) {',
        '    return error;',
        '  }',
        '}',
      ].join('\n'),
    ),
    flagged(
      [
        'export function parse(text: string) {',
        '  try {',
        '    return new URL(text);',
        '  } finally {',
        '    console.info("done");',
        '  }',
        '}',
      ].join('\n'),
    ),
    flagged(
      [
        'export function check(text: string) { return URL.canParse(text); }',
        'export function parse(text: string) { return new URL(text); }',
      ].join('\n'),
    ),
  ],
});
