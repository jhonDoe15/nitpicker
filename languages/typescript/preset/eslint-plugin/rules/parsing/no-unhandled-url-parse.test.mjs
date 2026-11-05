import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-unhandled-url-parse.mjs';

const tester = typescriptRuleTester();

function flagged(code) {
  return { code, errors: [{ messageId: 'unhandledUrlParse' }] };
}

tester.run('no-unhandled-url-parse', rule, {
  valid: [
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
  ],
  invalid: [
    flagged('export function parse(text: string) { return new URL(text); }'),
    flagged(
      'export function parse(path: string) { return new URL(`https://shop.example/${path}`); }',
    ),
    flagged(
      'export function parse(path: string) { return new URL("https://shop.example/" + path); }',
    ),
    flagged('export function local(path: string) { return new URL(path, "http://localhost"); }'),
    flagged('export const configured = new URL(process.env.API_URL ?? "");'),
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
