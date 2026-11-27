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
    'function f(source) { const text = stripFoo(source); return text.match(/\\bcase\\b/g); }',
    'function count(source) { return source.match(/\\bcase\\b/g); }\nconst n = count(stripComments(text));',
    'function count(source) { return source.match(/\\bcase\\b/g); }\nconst a = count(stripComments(x));\nconst b = count(maskStrings(y));',
    'const count = (source) => source.match(/\\bcase\\b/g);\nconst n = count(blankComments(text));',
    'const source = stripComments(raw); const n = source.match(/\\bcase\\b/g);',
    'function f(source) { return stripStringLiterals(source).length + source.match(/\\bcase\\b/g).length; }',
    'function f(source) { return removeComments(source), source.match(/\\bcase\\b/g); }',
    "const text = readFileSync(path.join(dir, 'notes.txt'), 'utf8'); text.match(/\\bcase\\b/g);",
    'function f(source) { return source.match(/\\bcase\\b/g); }\nitems.f(stripComments(b));',
    'class A { count(source) { return source.match(/\\bcase\\b/g); } }\nnew A().count(stripComments(x));',
    'const o = { count(source) { return source.match(/\\bcase\\b/g); } };\no.count(stripComments(x));',
    'function f(source) { return source.match(); }',
    'function f(source) { return /\\bcase\\b/.test(); }',
    'function f(source) { return source.length(); }',
    'function f(source) { return source[0](/\\bcase\\b/); }',
    'function f(source) { return g(source); }',
    'function f(source) { return source.match(pattern); }',
    "function f(source) { return source.match('case'); }",
    'function f(source) { return source.match(new RegExp()); }',
    "function f(source) { return source.match(new Foo('case')); }",
    "function f(source) { return source.match(new ns.RegExp('case')); }",
    'const n = 5; n.match(/\\bcase\\b/g);',
    "readFile(p, 'utf8').match(/\\bcase\\b/g);",
    "readFileSync(a.b(c), 'utf8').match(/\\bcase\\b/g);",
    "readFileSync(`${dir}/notes.txt`, 'utf8').match(/\\bcase\\b/g);",
    "fs.readFileSync('notes.txt', 'utf8').match(/\\bcase\\b/g);",
    "(a || b)('x.ts').match(/\\bcase\\b/g);",
  ],
  invalid: [
    invalid(
      'function g() { const undefined = (source) => source.match(/\\bcase\\b/g); (() => 1)(stripComments(x)); }',
    ),
    invalid('function f(source) { JSON.parse(x); return source.match(/\\bcase\\b/g); }'),
    invalid('function f(source) { parse(x); return source.match(/\\bcase\\b/g); }'),
    invalid(
      "const text = readFileSync('a.ts', 'utf8'); parseModule(text); text.match(/\\bimport\\b/g);",
    ),
    invalid('const source = JSON.parse(raw).text; const n = source.match(/\\bcase\\b/g);'),
    invalid('function f(source) { return flexible(source), source.match(/\\bcase\\b/g); }'),
    invalid(
      "const text = readFileSync(path.join(dir, 'A.java'), 'utf8'); text.match(/\\bcase\\b/g);",
    ),
    invalid(
      'function count(source) { return source.match(/\\bcase\\b/g); }\nconst n = count(text);',
    ),
    invalid(
      'function count(source) { return source.match(/\\bcase\\b/g); }\nconst a = count(stripComments(x));\nconst b = count(text);',
    ),
    invalid('function count(source) { return source.match(/\\bcase\\b/g); }'),
    invalid(
      'function f(source) { const c = stripComments(source); return c.split("\\n").map((l) => source.match(/\\bcase\\b/g)); }',
    ),
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
    invalid(`readFileSync(\`\${dir}/Main.java\`, 'utf8').toString().search(/\\bclass\\s+\\w+/);`),
    invalid("const text = readFileSync('a.ts', 'utf8'); (text as string).match(/\\bcase\\b/g);"),
    invalid('function f({ source }) { return source.match(/\\bcase\\b/g); }'),
    invalid('run(function (source) { return source.match(/\\bcase\\b/g); });'),
    invalid('const o = { count: (source) => source.match(/\\bcase\\b/g) };\no.count(text);'),
    invalid('const f = (source) => source.match(/\\bcase\\b/g);\nf(text);'),
    invalid(
      'class A { count(source) { return source.match(/\\bcase\\b/g); } }\nnew A().count(text);',
    ),
    invalid('function f(source) { return source.match(/\\bcase\\b/g); }\nf();'),
    invalid('function f(source) { return RegExp("\\\\bcase\\\\b").exec(source); }'),
    invalid('const raw = trim(q); const source = norm(raw, raw); source.match(/\\bcase\\b/g);'),
    invalid('const source = a(b(c(d(e(f(g(h(x)))))))); source.match(/\\bcase\\b/g);'),
    invalid('const source = norm(raw); source.match(/\\bcase\\b/g);'),
    invalid('const source = raw.trim; source.match(/\\bcase\\b/g);'),
    invalid("readFileSync('a.ts', 'utf8')!.match(/\\bcase\\b/g);"),
    invalid("fs.readFileSync(path.join(dir, 'a.ts'), 'utf8').match(/\\bcase\\b/g);"),
    invalid('readText(path.join(dir, `${name}.py`)).match(/\\bcase\\b/g);'),
  ],
});
