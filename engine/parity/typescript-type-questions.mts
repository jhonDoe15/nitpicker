import { Linter } from 'eslint';
import * as parser from '@typescript-eslint/parser';
import ts from 'typescript';
import { directoryRules } from '../../languages/typescript/preset/eslint-plugin/rules.generated.mts';
import { readFileSync, writeFileSync, createWriteStream } from 'node:fs';

// node engine/parity/typescript-type-questions.mts <rule,rule> <tsconfig.json> <file list> <out.json>
// Runs the named plugin rules with the JavaScript compiler API and writes every question they ask the
// type checker about a node, with its answer, to <out.json>.questions.jsonl. Run it from the project folder.
import path from 'node:path';
const [names, tsconfig, list, out] = process.argv.slice(2);
const root = path.dirname(tsconfig);
const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(tsconfig, ts.sys.readFile).config, ts.sys, root, undefined, tsconfig);
const t0 = Date.now();
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
console.log('program', ((Date.now() - t0) / 1000).toFixed(1), 's', ts.version);
const log = createWriteStream(out + '.questions.jsonl');
const seen = new Set();
const counts = {};
let current = '';
function where(node) { return [node.getSourceFile().fileName, node.getStart(), node.end, ts.SyntaxKind[node.kind]]; }
function note(method, node, answer) {
  counts[`${current} ${method}`] = (counts[`${current} ${method}`] ?? 0) + 1;
  const w = where(node);
  const key = method + '|' + w.join('|');
  if (seen.has(key)) return;
  seen.add(key);
  log.write(JSON.stringify([method, ...w, answer]) + '\n');
}
function symbolAnswer(symbol) {
  if (!symbol) return null;
  return [symbol.name, (symbol.declarations ?? []).map((d) => `${d.getSourceFile().fileName}:${d.getStart()}-${d.end}`)];
}
const F = ts.TypeFormatFlags.NoTruncation;
for (const method of ['getTypeAtLocation', 'getContextualType', 'getTypeFromTypeNode']) {
  const original = checker[method].bind(checker);
  checker[method] = (node, ...rest) => { const type = original(node, ...rest); note(method, node, type ? [checker.typeToString(type, undefined, F), type.flags] : null); return type; };
}
for (const method of ['getSymbolAtLocation', 'getShorthandAssignmentValueSymbol']) {
  const original = checker[method].bind(checker);
  checker[method] = (node, ...rest) => { const symbol = original(node, ...rest); note(method, node, symbolAnswer(symbol)); return symbol; };
}
{
  const original = checker.getResolvedSignature.bind(checker);
  checker.getResolvedSignature = (node, ...rest) => { const signature = original(node, ...rest); note('getResolvedSignature', node, signature ? [checker.signatureToString(signature, undefined, F), signature.declaration ? `${signature.declaration.getSourceFile().fileName}:${signature.declaration.getStart()}-${signature.declaration.end}` : null] : null); return signature; };
}
for (const method of Object.keys(checker)) {
  if (typeof checker[method] !== 'function' || ['getTypeAtLocation', 'getContextualType', 'getTypeFromTypeNode', 'getSymbolAtLocation', 'getShorthandAssignmentValueSymbol', 'getResolvedSignature', 'typeToString', 'signatureToString'].includes(method)) continue;
  const original = checker[method];
  checker[method] = function (...args) { counts[`${current} ${method}`] = (counts[`${current} ${method}`] ?? 0) + 1; return original.apply(this, args); };
}
const ruleNames = names.split(',');
const timed = {};
const plugin = { rules: Object.fromEntries(Object.entries(directoryRules).map(([name, rule]) => [name, { ...rule, create(context) {
  const listeners = rule.create(context);
  return Object.fromEntries(Object.entries(listeners).map(([key, fn]) => [key, (...a) => { const before = current; current = name; const s = process.hrtime.bigint(); try { return fn(...a); } finally { timed[name] = (timed[name] ?? 0) + Number(process.hrtime.bigint() - s) / 1e6; current = before; } }]));
} }])) };
const rules = Object.fromEntries(ruleNames.map((n) => [`nitpicker/${n}`, 'error']));
const linter = new Linter({ cwd: root });
const rows = [];
const started = process.cpuUsage();
for (const file of readFileSync(list, 'utf8').split('\n').filter(Boolean)) {
  const text = readFileSync(file, 'utf8');
  const messages = linter.verify(text, [{
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: { parser, parserOptions: { programs: [program], ecmaFeatures: { jsx: file.endsWith('x') } }, sourceType: 'module' },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    plugins: { nitpicker: plugin },
    rules,
  }], { filename: file });
  for (const m of messages) rows.push([file, m.ruleId ?? (m.fatal ? '!fatal' : '!other'), m.line, m.column, m.message]);
}
const cpu = process.cpuUsage(started);
log.end();
writeFileSync(out, JSON.stringify({ rows, counts, timed }));
console.log(rows.length, 'rows', seen.size, 'distinct questions', ((cpu.user + cpu.system) / 1e6).toFixed(1), 'cpu-s lint');
const byRule = {};
for (const r of rows) byRule[r[1]] = (byRule[r[1]] ?? 0) + 1;
console.log(Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 12));
