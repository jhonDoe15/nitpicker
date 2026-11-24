import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-keyword-regex-on-source.mts';

const ruleTester = typescriptRuleTester();

function failing(keyword: string, code: string) {
  return {
    code,
    errors: [{ messageId: 'keywordRegexOnSource' as const, data: { keyword } }],
  };
}

ruleTester.run('no-keyword-regex-on-source', rule, {
  valid: cases([
    'function parseHeader(header: string) { return /\\bfrom\\b/i.test(header); }',
    'function checkStatus(statusCode: string) { return /\\breturn\\b/.test(statusCode); }',
    'function checkError(errorCode: string) { return errorCode.match(/\\bcase\\b/); }',
    'function checkData(dataSource: string) { return /\\bimport\\b/.test(dataSource); }',
    'function checkEvent(event: { source: string }) { return /\\bcase\\b/.test(event.source); }',
    'function checkErr(err: { code: string }) { return /\\bthrow\\b/.test(err.code); }',
    'function checkText(text: string) { return /\\bimport\\b/.test(text); }',
    'function hasTodo(source: string) { return /\\btodo\\b/i.test(source); }',
    'function hasClassName(source: string) { return /\\bclassName\\b/.test(source); }',
    'function hasImportPath(source: string) { return /\\bimportPath\\b/.test(source); }',
    "function normalize(source: string) { return source.replace(/\\r\\n/g, '\\n'); }",
    'function hasImport(source: string) { const clean = stripComments(source); return /\\bimport\\b/.test(clean); }',
    'function hasImport(source: string) { source = maskStringsAndComments(source); return /\\bimport\\b/.test(source); }',
    'function hasClass(sourceCode: string) { const stripped = removeComments(sourceCode); return stripped.match(/\\bclass\\s+\\w+/); }',
    'function hasCase(fileContent: string) { const blanked = blankComments(fileContent); return /\\bcase\\b/.test(blanked); }',
    'function hasRequire(code: string) { const skipped = skipComments(code); return /\\brequire\\(/.test(skipped); }',
    'function hasExport(source: string) { const tokens = tokenize(source); return tokens.length > 0 && /\\bexport\\b/.test(source); }',
    'function hasExport(source: string) { const tokens = lexCode(source); return tokens.length > 0 && /\\bexport\\b/.test(source); }',
    'function hasImport(source: string) { return stripComments(source).match(/\\bimport\\b/); }',
    'function hasImport(source: string) { return /\\bimport\\b/.test(stripComments(source)); }',
    "function hasImport(source: string) { return source.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').match(/\\bimport\\b/); }",
    "function hasClass(source: string) { const clean = source.replace(/\\/\\/[^\\n]*/g, ''); return clean.match(/\\bclass\\s+\\w+/); }",
    "function hasImport(source: string) { const clean = source.replace(new RegExp('/\\\\*[\\\\s\\\\S]*?\\\\*/', 'g'), ''); return /\\bimport\\b/.test(clean); }",
    'function scan(source: string) { return source.match(/\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*|\\bimport\\b/g); }',
    "function scan(source: string) { return new RegExp('//.*|\\\\bcase\\\\b', 'g').exec(source); }",
    "function readDocs() { const text = fs.readFileSync('README.md', 'utf8'); return /\\bimport\\b/.test(text); }",
    "function readPkg() { const fileContent = fs.readFileSync('package.json', 'utf8'); return /\\bexport\\b/.test(fileContent); }",
    "function readNotes() { const source = fs.readFileSync('notes.txt', 'utf8'); return /\\bclass\\s+\\w+/.test(source); }",
  ]),
  invalid: [
    failing('case', 'function hasCase(source: string) { return /\\bcase\\b/.test(source); }'),
    failing('import', 'function hasImport(code: string) { return /\\bimport\\b/.exec(code); }'),
    failing(
      'class',
      'function findClasses(sourceText: string) { return sourceText.match(/\\bclass\\s+\\w+/g); }',
    ),
    failing(
      'require',
      'function findRequires(sourceCode: string) { return [...sourceCode.matchAll(/\\brequire\\(/g)]; }',
    ),
    failing(
      'require',
      'function findRequires(jsSource: string) { return jsSource.search(/\\brequire\\s*\\(/); }',
    ),
    failing(
      'var',
      "function replaceVar(tsCode: string) { return tsCode.replace(/\\bvar\\b/g, 'let'); }",
    ),
    failing(
      'let',
      "function replaceLet(fileSource: string) { return fileSource.replaceAll(/\\blet\\b/g, 'const'); }",
    ),
    failing(
      'case',
      'function splitCases(fileContent: string) { return fileContent.split(/\\bcase\\b/); }',
    ),
    failing(
      'import',
      'function hasImport(fileText: string) { return /\\b(?:import|export)\\b/.test(fileText); }',
    ),
    failing(
      'const',
      'function hasDecl(source: string) { return /\\b(const|let|var)\\s+\\w+/.test(source); }',
    ),
    failing(
      'import',
      "function hasImport(source: string) { return new RegExp('\\\\bimport\\\\b', 'g').test(source); }",
    ),
    failing(
      'function',
      "function hasFn(source: string) { return RegExp('\\\\bfunction\\\\s+\\\\w+').test(source); }",
    ),
    failing(
      'import',
      'const IMPORT_RE = /\\bimport\\b/;\nfunction hasImport(source: string) { return IMPORT_RE.test(source); }',
    ),
    failing(
      'class',
      "const PAT = '\\\\bclass\\\\s+\\\\w+';\nconst RE = new RegExp(PAT);\nfunction hasClass(source: string) { return source.match(RE); }",
    ),
    failing(
      'class',
      "function checkJava() { const text = fs.readFileSync('App.java', 'utf8'); return /\\bclass\\s+\\w+/.test(text); }",
    ),
    failing(
      'def',
      "async function checkPy(dir: string) { const text = await fs.promises.readFile(path.join(dir, 'main.py'), 'utf8'); return /\\bdef\\s+\\w+/.test(text); }",
    ),
    failing(
      'package',
      "function checkGo(dir: string) { const raw = readFileSync(`${dir}/server.go`, 'utf8'); return raw.match(/\\bpackage\\s+\\w+/); }",
    ),
    failing(
      'struct',
      "function checkRust() { return readFileSync('lib.rs', 'utf8').match(/\\bstruct\\s+\\w+/); }",
    ),
    failing(
      'import',
      "function checkTsx() { const content = readFileSync('App.tsx', 'utf8'); return /\\bimport\\b/.test(content); }",
    ),
    failing(
      'export',
      "function checkMts() { const body = readFileSync('index.mts', 'utf8'); return /\\bexport\\b/.test(body); }",
    ),
    failing(
      'import',
      'function checkTrimmed(source: string) { return source.trim().match(/\\bimport\\b/); }',
    ),
    failing(
      'class',
      "function checkNormalized(source: string) { return source.replace(/\\r\\n/g, '\\n').match(/\\bclass\\s+\\w+/); }",
    ),
    failing(
      'import',
      'function checkFile(file: { code: string }) { return /\\bimport\\b/.test(file.code); }',
    ),
    failing(
      'import',
      'function checkOrder(source: string) { const found = /\\bimport\\b/.test(source); const clean = stripComments(source); return found && clean.length > 0; }',
    ),
  ],
});
