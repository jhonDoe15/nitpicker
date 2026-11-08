import { rule } from './no-string-as-regex.mjs';
import { typedRegexProject } from './test-support/typed-project.mjs';

const { tester, typed, typedJs } = typedRegexProject('nitpicker-string-regex-');

function stringPattern(method) {
  return [{ messageId: 'stringPattern', data: { method } }];
}

function unescaped(value) {
  return [{ messageId: 'unescapedValue', data: { value } }];
}

tester.run('no-string-as-regex', rule, {
  valid: [
    'export function has(text: string) { return text.match(/a.b/); }',
    'export function has(text: string, pattern: RegExp) { return text.search(pattern); }',
    'export function has(text: string, pattern: string) { return text.includes(pattern); }',
    'export function find(text: string, pattern: string) { return [...text.matchAll(new RegExp(pattern, "g"))]; }',
    'export function has(text: string, pattern: string | RegExp) { return text.match(pattern); }',
    'export function has(items: { match(value: string): boolean }, value: string) { return items.match(value); }',
    'const PREFIX = "api";\nexport function route() { return new RegExp(`^/${PREFIX}/`); }',
    'export function route(name: string) { return new RegExp(`^/${escapeRegExp(name)}/`); }\ndeclare function escapeRegExp(value: string): string;',
    'export function route(name: string) { return new RegExp("^/" + lodash.escapeRegExp(name) + "/"); }\ndeclare const lodash: { escapeRegExp(value: string): string };',
    'export function anchored(pattern: RegExp) { return new RegExp(`^(?:${pattern.source})$`, pattern.flags); }',
    'export function repeat(count: number) { return new RegExp(`^\\\\d{${count}}$`); }',
    "export function route(kind: 'user' | 'team') { return new RegExp(`^/${kind}/\\\\d+$`); }",
    'export function compile(pattern: string) { return new RegExp(pattern, "u"); }',
    'const NAMES = ["a.b", "c"].join("|");\nexport function names() { return new RegExp(`^(?:${NAMES})$`); }',
    'const WORDS = ["a", "b"];\nexport function words() { return WORDS.map((word) => new RegExp(`^${word}$`)); }',
    'const WORDS = ["a", "b"];\nexport function words() { return new RegExp(`^(?:${WORDS.join("|")})$`); }',
    'export function words(names: string[]) { const pattern = names.map(escapeRegExp).join("|"); return new RegExp(`^(?:${pattern})$`); }\ndeclare function escapeRegExp(value: string): string;',
    'export function route() { const name = load(); return new RegExp(`^/${name}/`); }\ndeclare function load(): string;',
    'export function compile(left: string, right: string) { return new RegExp(left + right); }',
    'export function route(name: string) { return new RegExp(`^${RegExp.escape(name)}$`); }\ndeclare global { interface RegExpConstructor { escape(value: string): string } }',
    "export function route(name: string) { return new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`); }",
    'export function route(name: string, upper: boolean) { return new RegExp(`^${upper ? "A" : "b"}$`); }',
    typedJs('export function route(name) { return new RegExp(`^/${name}/`); }'),
    typedJs('export function has(text, pattern) { return text.match(pattern); }'),
  ].map((code) => (typeof code === 'string' ? typed(code) : code)),
  invalid: [
    typed(
      'export function has(text: string) { return text.match("a.b"); }',
      stringPattern('match'),
    ),
    typed(
      'export function has(text: string, needle: string) { return text.search(needle) !== -1; }',
      stringPattern('search'),
    ),
    typed(
      'export function all(text: string, needle: string) { return [...text.matchAll(needle)]; }',
      stringPattern('matchAll'),
    ),
    typed(
      "export function has(text: string, needle: 'a.b' | 'c') { return text.match(needle); }",
      stringPattern('match'),
    ),
    typed(
      'export function route(name: string) { return new RegExp(`^/${name}/`); }',
      unescaped('name'),
    ),
    typed(
      'export function route(name: string) { return RegExp("^/" + name + "/", "u"); }',
      unescaped('name'),
    ),
    typed(
      'export function route(user: { name: string }) { return new RegExp(String.raw`^/${user.name}/\\d+`); }',
      unescaped('user.name'),
    ),
    typed(
      'export function route(id: `user-${string}`) { return new RegExp(`^/${id}$`); }',
      unescaped('id'),
    ),
    typed(
      'export function route(name: string) { return new RegExp(`^${escapeHtml(name)}$`); }\ndeclare function escapeHtml(value: string): string;',
      unescaped('escapeHtml(name)'),
    ),
    typed(
      'export function route(names: string[]) { const pattern = names.join("|"); return new RegExp(`^(?:${pattern})$`); }',
      unescaped('pattern'),
    ),
    typed(
      'export function routes(names: string[]) { return names.map((name) => new RegExp(`^/${name}/`)); }',
      unescaped('name'),
    ),
    typed(
      'export function routes(names: string[]) { const found = []; for (const name of names) { found.push(new RegExp(`^/${name}/`)); } return found; }',
      unescaped('name'),
    ),
    typedJs(
      '/** @param {string} name */\nexport function route(name) { return new RegExp(`^/${name}/`); }',
      unescaped('name'),
    ),
    typedJs(
      '/** @param {string} text */\nexport function has(text) { return text.match("a.b"); }',
      stringPattern('match'),
    ),
  ],
});
