import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-keyword-regex-over-source.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'keywordRegex' }] };
}

tester.run('no-keyword-regex-over-source', rule, {
  valid: [
    'function f(code) { return /\\bimport\\b/.test(code); }',
    'function f(source) { return source.match(/\\bfoo\\b/g); }',
    'function f(title) { return title.match(/\\bcase\\b/g); }',
    'function f(source) { return stripComments(source).match(/\\bcase\\b/g); }',
    'function f(source) { const code = maskStrings(source); return code.match(/\\bcase\\b/g); }',
    'function f(source) { const tokens = tokenize(source); return source.match(/\\bcase\\b/g); }',
    "const text = readFileSync('notes.txt', 'utf8'); text.match(/\\bcase\\b/g);",
    'function f(source) { return source.match(/showcase/g); }',
    'function f(source) { return source.match(/\\bcases\\b/g); }',
    'function f(description) { return /\\bimport\\b/.test(description); }',
    "const text = readFileSync('a.ts', 'utf8'); parseModule(text); text.match(/\\bimport\\b/g);",
  ],
  invalid: [
    invalid('function f(source) { return source.match(/\\bcase\\b/g); }'),
    invalid('function f(sourceCode) { return /\\bimport\\b/.test(sourceCode); }'),
    invalid(
      "function f(sourceText) { return sourceText.split(new RegExp('\\\\bclass\\\\s+\\\\w+')); }",
    ),
    invalid("const text = readFileSync('Foo.java', 'utf8'); text.replace(/\\bcase\\b/g, 'x');"),
    invalid(
      "async function f() { const text = await readFile('a.ts', 'utf8'); return [...text.matchAll(/\\brequire\\(/g)]; }",
    ),
    invalid('function f(source) { const re = /\\b(?:case|default)\\b/g; return re.exec(source); }'),
    invalid("readFileSync(`${dir}/Main.java`, 'utf8').toString().search(/\\bclass\\s+\\w+/);"),
  ],
});
