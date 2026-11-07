import { rule } from './no-shared-stateful-regex.mjs';
import { typedRegexProject } from './test-support/typed-project.mjs';

const { tester, typed, typedJs } = typedRegexProject('nitpicker-stateful-regex-');

function shared(name, method, flag = 'g') {
  return [{ messageId: 'sharedRegex', data: { name, method, flag } }];
}

tester.run('no-shared-stateful-regex', rule, {
  valid: [
    'const ROUTE = /^\\/api\\//;\nexport function isApi(path: string) { return ROUTE.test(path); }',
    'export function isApi(path: string) { const route = /^\\/api\\//g; return route.test(path); }',
    'export function count(text: string) { const word = /\\w+/g; let total = 0; while (word.exec(text) !== null) { total += 1; } return total; }',
    'const WORD = /\\w+/g;\nexport function words(text: string) { const found: string[] = []; let match; while ((match = WORD.exec(text)) !== null) { found.push(match[0]); } return found; }',
    'const WORD = /\\w+/g;\nexport function words(text: string) { return [...text.matchAll(WORD)].map((match) => match[0]); }',
    'const WORD = /\\w+/g;\nexport function words(text: string) { return text.match(WORD) ?? []; }',
    "const WORD = /\\w+/g;\nexport function clean(text: string) { return text.replace(WORD, ''); }",
    'const WORD = /\\w+/g;\nexport function first(text: string) { WORD.lastIndex = 0; return WORD.exec(text); }',
    'const TOKEN = /\\d+/y;\nexport function read(text: string, at: number) { TOKEN.lastIndex = at; return TOKEN.exec(text); }',
    'export function each(lines: string[]) { return lines.filter((line) => { const word = /\\w+/g; return word.test(line); }); }',
    'export function each(lines: string[]) { for (const line of lines) { const word = new RegExp("\\\\w+", "g"); if (word.test(line)) { return line; } } return undefined; }',
    'const flags = "i";\nconst WORD = new RegExp("\\\\w+", flags);\nexport function has(text: string) { return WORD.test(text); }',
    'export function has(text: string, flags: string) { const word = new RegExp("\\\\w+", flags); return word.test(text) && word.test(text); }',
    'export class Router { private readonly route = /^\\/api\\//i; matches(path: string) { return this.route.test(path); } }',
    'export function has(pattern: string, text: string) { return text.includes(pattern); }',
    'export function has(pattern: RegExp, text: string) { return pattern.test(text); }',
    'export function pick(text: string, strict: boolean) { const word = /\\w+/g; if (strict) { return word.test(text); } else { return word.test(`${text}!`); } }',
    'export function pick(text: string, strict: boolean) { const word = /\\w+/g; return strict ? word.test(text) : word.exec(text) !== null; }',
    'export function pick(text: string, kind: number) { const word = /\\w+/g; switch (kind) { case 1: return word.test(text); default: return word.test(`${text}!`); } }',
    'const WORD = /\\w+/g;\nexport function has(text: string) { try { return WORD.test(text); } finally { WORD.lastIndex = 0; } }',
    'const WORD = /\\w+/g;\nexport function count(text: string, limit: number) { let total = 0; while (total < limit && WORD.test(text)) { total += 1; } return total; }',
    'export function has(pattern: { test(text: string): boolean }, text: string) { return pattern.test(text); }',
    typedJs('export function has(pattern, text) { return pattern.test(text); }'),
  ].map((code) => (typeof code === 'string' ? typed(code) : code)),
  invalid: [
    typed(
      'const ROUTE = /^\\/api\\//g;\nexport function isApi(path: string) { return ROUTE.test(path); }',
      shared('ROUTE', 'test'),
    ),
    typed(
      'const WORD = new RegExp("\\\\w+", "gu");\nexport function first(text: string) { return WORD.exec(text); }',
      shared('WORD', 'exec'),
    ),
    typed(
      'const WORD = new RegExp(/\\w+/g);\nexport function first(text: string) { return WORD.exec(text); }',
      shared('WORD', 'exec'),
    ),
    typed(
      'const TOKEN = /\\d+/y;\nexport function read(text: string) { return TOKEN.test(text); }',
      shared('TOKEN', 'test', 'y'),
    ),
    typed(
      'const TOKEN = /\\d+/y;\nexport function read(text: string) { return text.match(TOKEN); }',
      shared('TOKEN', 'match', 'y'),
    ),
    typed(
      'export function both(left: string, right: string) { const word = /\\w+/g; return word.test(left) && word.test(right); }',
      shared('word', 'test'),
    ),
    typed(
      'export function any(lines: string[]) { const word = /\\w+/g; return lines.filter((line) => word.test(line)); }',
      shared('word', 'test'),
    ),
    typed(
      'export function any(lines: string[]) { const word = /\\w+/g; for (const line of lines) { if (word.test(line)) { return line; } } return undefined; }',
      shared('word', 'test'),
    ),
    typed(
      'export class Router { private readonly route = /^\\/api\\//g; matches(path: string) { return this.route.test(path); } }',
      shared('this.route', 'test'),
    ),
    typed(
      'export class Router { static readonly ROUTE = /^\\/api\\//g; matches(path: string) { return Router.ROUTE.test(path); } }',
      shared('Router.ROUTE', 'test'),
    ),
    typed(
      'export class Router { readonly #route: RegExp; constructor() { this.#route = /^\\/api\\//g; } matches(path: string) { return this.#route.test(path); } }',
      shared('this.#route', 'test'),
    ),
    typed(
      'const PATTERNS = { route: /^\\/api\\//g } as const;\nexport function isApi(path: string) { return PATTERNS.route.test(path); }',
      shared('PATTERNS.route', 'test'),
    ),
  ],
});
