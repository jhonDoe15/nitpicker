import { typedRegexProject } from '../../regex/test-support/typed-project.mts';
import { rule } from './no-expanding-replacement-string.mts';

const { tester, typed, typedJs } = typedRegexProject('nitpicker-expanding-replacement-');

function expanding(method: string, value: string) {
  return [{ messageId: 'expandingReplacement', data: { method, value } }];
}

tester.run('no-expanding-replacement-string', rule, {
  valid: [
    "export function fill(text: string) { return text.replace('{name}', 'a'); }",
    "export function fill(text: string) { return text.replace(/(\\d+)/, '$1.0'); }",
    "const FILLER = '<b>$&</b>';\nexport function fill(text: string) { return text.replace(/a/g, FILLER); }",
    'export function fill(text: string, name: string) { return text.replace(/a/g, `$1${name}`); }',
    "export function fill(text: string, name: string) { return text.replace(/(a)/g, '$1' + name); }",
    "export function fill(text: string, name: string) { return text.replace('{name}', () => name); }",
    "export function fill(text: string, name: string) { return text.replaceAll('{name}', function () { return name; }); }",
    "export function fill(text: string, make: () => string) { return text.replace('{name}', make); }",
    "export function fill(text: string, count: number) { return text.replace('{count}', String(count)); }",
    "export function fill(text: string, count: number) { return text.replace('{count}', count.toFixed(2)); }",
    "export function fill(text: string, count: number) { return text.replace('{count}', `${count}`); }",
    "export function fill(text: string, kind: 'a' | 'b') { return text.replace('{kind}', kind); }",
    "export function fill(text: string, name: string) { return text.replace('{name}', name.replace(/\\$/g, '$$$$')); }",
    "export function fill(text: string, name: string) { return text.replace('{name}', escapeReplacement(name)); }\ndeclare function escapeReplacement(value: string): string;",
    "export function fill(text: string, name: string) { return text.replace('{name}', name.replaceAll('$', '$$$$')); }",
    "export function fill(items: { replace(a: string, b: string): string }, name: string) { return items.replace('{name}', name); }",
    "export function fill(text: any, name: string) { return text.replace('{name}', name); }",
    "export function fill(text: string, flag: boolean) { return text.replace('{flag}', flag ? 'yes' : 'no'); }",
    typedJs("export function fill(text, name) { return text.replace('{name}', () => name); }"),
    "export function fill(text: string, name: string) { return text.split('{name}').join(name); }",
    "export function fill(text: string, name: string) { if (!name.includes('$')) { return text.replaceAll('{name}', name); } return text; }",
    "export function fill(text: string, name: string) { return !name.includes('$') ? text.replace('{name}', name) : text; }",
  ].map((code) => (typeof code === 'string' ? typed(code) : code)),
  invalid: [
    typed(
      "export function fill(text: string, name: string) { if (name.includes('$')) { return text.replace('{name}', name); } return text; }",
      expanding('replace', 'name'),
    ),
    typed(
      'export function fill(text: string, arg: unknown) { return text.replace(`<<${1}>>`, String(arg)); }',
      expanding('replace', 'String(arg)'),
    ),
    typed(
      'export function fill(css: string, dep: { placeholder: string; url: string }) { return css.replace(dep.placeholder, dep.url); }',
      expanding('replace', 'dep.url'),
    ),
    typed(
      "export function fill(prompt: string, text: string) { return prompt.replace('{conversation}', text); }",
      expanding('replace', 'text'),
    ),
    typed(
      "export function fill(name: string, location: string) { return name.replace('{Location}', location); }",
      expanding('replace', 'location'),
    ),
    typed(
      'export function fill(html: string, title: string) { return html.replace(/%TITLE%/g, title); }',
      expanding('replace', 'title'),
    ),
    typed(
      "export function fill(text: string, name: string) { return text.replaceAll('{name}', name); }",
      expanding('replaceAll', 'name'),
    ),
    typed(
      "export function fill(text: string, name: string) { return text.replace('{name}', `Dr. ${name}`); }",
      expanding('replace', '`Dr. ${name}`'),
    ),
    typed(
      "export function fill(text: string, name: string) { return text.replace('{name}', name + '!'); }",
      expanding('replace', "name + '!'"),
    ),
    typed(
      "export function fill(text: string, name?: string) { return text.replace('{name}', name ?? ''); }",
      expanding('replace', "name ?? ''"),
    ),
    typed(
      "export function fill(text: string, name: string) { return text.replace('{name}', name.trim()); }",
      expanding('replace', 'name.trim()'),
    ),
    typed(
      "export function fill(text: string, url: URL) { return text.replace('{url}', url.href); }",
      expanding('replace', 'url.href'),
    ),
  ],
});
