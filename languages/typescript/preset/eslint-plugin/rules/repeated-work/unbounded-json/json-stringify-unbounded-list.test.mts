import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './json-stringify-unbounded-list.mts';

const tester = typescriptRuleTester();
const prodFile = '/repo/src/reports/output.ts';
const err = [{ messageId: 'unboundedJsonList' }];

tester.run('json-stringify-unbounded-list', rule, {
  valid: [
    {
      filename: prodFile,
      code: 'export function save(summary) { writeFileSync(outPath, JSON.stringify(summary)); }',
    },
    {
      filename: prodFile,
      code: 'export function save(config) { fs.writeFileSync(outPath, JSON.stringify(config, null, 2)); }',
    },
    {
      filename: prodFile,
      code: 'export function save(options, manifest, meta, header, status) { writeFileSync(p, JSON.stringify({ options, manifest, meta, header, status })); }',
    },
    {
      filename: prodFile,
      code: 'export function save(findings) { writeFileSync(outPath, JSON.stringify(findings.slice(0, 100))); }',
    },
    {
      filename: prodFile,
      code: 'export function save(findings) { const top = findings.slice(0, 50); writeFileSync(outPath, JSON.stringify(top)); }',
    },
    {
      filename: prodFile,
      code: 'export function save(findings) { writeFileSync(outPath, JSON.stringify({ findings: findings.slice(0, 25) })); }',
    },
    {
      filename: prodFile,
      code: "export function save() { writeFileSync(outPath, JSON.stringify(['a', 'b', 'c'])); }",
    },
    {
      filename: prodFile,
      code: "export function save() { const items = ['a', 'b']; writeFileSync(outPath, items.join('\\n')); }",
    },
    {
      filename: prodFile,
      code: 'export function format(findings) { return JSON.stringify(findings); }',
    },
    {
      filename: prodFile,
      code: "export function loadConfig() { const config = JSON.parse(readFileSync('config.json', 'utf8')); return config; }",
    },
    {
      filename: prodFile,
      code: "export function loadManifest(manifestPath) { return JSON.parse(readFileSync(manifestPath, 'utf8')); }",
    },
    {
      filename: prodFile,
      code: "export function loadSummary() { const findingsSummary = JSON.parse(readFileSync('summary.json', 'utf8')); return findingsSummary; }",
    },
    {
      filename: '/repo/src/reports/output.test.ts',
      code: 'export function save(findings) { writeFileSync(outPath, JSON.stringify(findings)); }',
    },
    {
      filename: '/repo/tests/output.ts',
      code: "export function load() { return JSON.parse(readFileSync('findings.json', 'utf8')); }",
    },
  ],
  invalid: [
    {
      filename: prodFile,
      code: 'export function save(findings) { writeFileSync(outPath, JSON.stringify(findings)); }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function save(results) { fs.writeFileSync(outPath, `${JSON.stringify(results)}\\n`); }',
      errors: err,
    },
    {
      filename: prodFile,
      code: "export function save(rows) { stream.write(JSON.stringify({ ok: true, rows }) + '\\n'); }",
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export async function save(report) { await fs.writeFile(outPath, JSON.stringify(report.findings)); }',
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function save(entries) { const text = JSON.stringify(entries); appendFileSync(outPath, text); }',
      errors: err,
    },
    {
      filename: prodFile,
      code: "export function save(lines) { writeSync(fd, lines.join('\\n')); }",
      errors: err,
    },
    {
      filename: prodFile,
      code: "export function save(events) { writeFileSync(outPath, events.map((e) => JSON.stringify(e)).join('\\n')); }",
      errors: err,
    },
    {
      filename: prodFile,
      code: 'export function save(input) { const collected = []; for (const x of input) { collected.push(x); } writeFileSync(outPath, JSON.stringify(collected)); }',
      errors: err,
    },
    {
      filename: prodFile,
      code: "export function save(input) { const collected = []; for (const x of input) { collected.push(String(x)); } writeFileSync(outPath, collected.join('\\n')); }",
      errors: err,
    },
    {
      filename: prodFile,
      code: "export function load() { return JSON.parse(readFileSync('findings.json', 'utf8')); }",
      errors: err,
    },
    {
      filename: prodFile,
      code: "export function load(resultsPath) { return JSON.parse(readFileSync(resultsPath, 'utf8')); }",
      errors: err,
    },
    {
      filename: prodFile,
      code: "export function load(filePath) { const violations = JSON.parse(readFileSync(filePath, 'utf8')); return violations; }",
      errors: err,
    },
    {
      filename: prodFile,
      code: "export async function load(filePath) { const raw = await readFile(filePath, 'utf8'); const { diagnostics } = JSON.parse(raw); return diagnostics; }",
      errors: err,
    },
  ],
});
