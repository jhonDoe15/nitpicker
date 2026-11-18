import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { typedRegexProject } from '../regex/test-support/typed-project.mts';
import { rule } from './no-unescaped-pattern-translation.mts';

const tester = typescriptRuleTester();

function regex(code: string) {
  return { code, errors: [{ messageId: 'regexTranslation' }] };
}

function like(code: string) {
  return { code, errors: [{ messageId: 'likeTranslation' }] };
}

tester.run('no-unescaped-pattern-translation', rule, {
  valid: [
    "export function allow(value: string, path: string) { const source = escapeRegExp(value).replace(/\\\\\\*\\\\\\*/g, '.*').replace(/\\\\\\*/g, '[^/]*'); return new RegExp(`^${source}$`).test(path); }",
    "export function allow(value: string) { return new RegExp(`^${value.replace(/[.+^${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*')}$`); }",
    "export function allow(value: string) { return new RegExp(`^${lodash.escapeRegExp(value).replace(/\\\\\\*/g, '.*').replace(/\\\\\\?/g, '.')}$`); }",
    "export function allow(path: string) { return new RegExp(`^${'src/**/*.ts'.replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*')}$`).test(path); }",
    "const GLOB = 'src/**/*.ts';\nexport function allow(path: string) { return new RegExp(GLOB.replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*')).test(path); }",
    "export function allow(value: string) { return value.replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*'); }",
    "export function allow(value: string) { return new RegExp(value.replace(/\\*\\*/g, '.*')); }",
    "export function slug(value: string) { return new RegExp(value.replace(/\\s+/g, '-').replace(/_/g, '-')); }",
    "export function title(value: string) { return value.replace(/-/g, ' ').replace(/_/g, ' '); }",
    "export function like(value: string) { return value.replace(/[\\\\%_]/g, '\\\\$&').replace(/\\*/g, '%').replace(/\\?/g, '_'); }",
    "export function like(value: string) { return value.replace(/%/g, '\\\\%').replace(/_/g, '\\\\_').replace(/\\*/g, '%'); }",
    "export function like(value: string) { return escapeLike(value).replace(/\\*/g, '%').replace(/\\?/g, '_'); }",
    "export function like() { return 'a*b?'.replace(/\\*/g, '%').replace(/\\?/g, '_'); }",
    "export function like(value: string) { return value.replace(/\\*/g, '%'); }",
    "export function clean(value: string) { return value.replace(/\\*/g, '%').replace(/\\?/g, '-'); }",
    "export function allow(value: string) { const source = value.replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*'); return source.length; }",
    'export function allow(value: string) { return picomatch(value); }',
    "const MAP: Record<string, string> = { '.*': '%' };\nexport function param(re: RegExp) { return re.source.replace(/^\\^/, '').replace(/\\$$/, '').replace(/\\.\\*|[.!%_]/g, (match) => MAP[match] ?? match); }",
  ],
  invalid: [
    regex(
      "export function allow(value: string, path: string) { const source = value.replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*'); return new RegExp(`^${source}$`).test(path); }",
    ),
    regex(
      "export function allow(value: string) { return new RegExp('^' + value.replaceAll('**', '.*').replaceAll('*', '[^/]*') + '$'); }",
    ),
    regex(
      "export function allow(value: string) { return new RegExp(`^${value.replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*')}$`); }",
    ),
    regex(
      "export function allow(value: string) { return RegExp(value.trim().replace(/\\?/g, '.').replace(/\\*/g, '.*'), 'i'); }",
    ),
    regex(
      "export function allow(value: string) { return new RegExp(value.replace(/\\./g, '\\\\.').replace(/\\*/g, '.*')); }",
    ),
    like(
      "export function like(re: RegExp) { return re.source.replace(/\\.\\*/g, '%').replace(/\\./g, '_'); }",
    ),
    like(
      "export function like(glob: string) { return `${glob.replace(/\\*/g, '%').replace(/\\?/g, '_')}`; }",
    ),
    like(
      "export function like(glob: string) { return glob.replaceAll('*', '%').replaceAll('?', '_').replaceAll('%%', '%'); }",
    ),
    like(
      "export function param(re: RegExp) { return re.source.replace(/\\.\\*/g, '%').replace(/\\./g, '_').replace(/\\\\_/g, '.').replace(/^\\^/g, '').replace(/\\$$/g, ''); }",
    ),
  ],
});

const { tester: typedTester, typed } = typedRegexProject('nitpicker-pattern-translation-');

typedTester.run('no-unescaped-pattern-translation with types', rule, {
  valid: [
    typed(
      "export function allow(value: string) { return new RegExp(`^${value.replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*')}$`); }",
    ),
    typed(
      "export function allow(value: string) { const source = value.replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*'); return new RegExp(`^${source}$`); }",
    ),
  ],
  invalid: [
    typed(
      "export function allow(value: string) { return new RegExp(value.replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*')); }",
      [{ messageId: 'regexTranslation', data: {} }],
    ),
    typed(
      "const OPTIONS = { glob: process.env.GLOB ?? '' };\nexport function allow() { return new RegExp(`^${OPTIONS.glob.replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*')}$`); }",
      [{ messageId: 'regexTranslation', data: {} }],
    ),
  ],
});
