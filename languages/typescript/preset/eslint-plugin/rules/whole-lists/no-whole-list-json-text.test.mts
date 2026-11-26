import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-whole-list-json-text.mts';

const tester = typescriptRuleTester();
const FS = "import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';";

function write(code: string) {
  return { code: `${FS} ${code}`, errors: [{ messageId: 'wholeWrite' }] };
}

function read(code: string) {
  return { code: `${FS} ${code}`, errors: [{ messageId: 'wholeRead' }] };
}

tester.run('no-whole-list-json-text', rule, {
  valid: [
    `${FS} writeFileSync(out, JSON.stringify(summary));`,
    `${FS} writeFileSync(out, JSON.stringify(findings.slice(0, 100)));`,
    `${FS} writeFileSync(out, JSON.stringify({ total: findings.length }));`,
    `${FS} writeFileSync(out, ['a', 'b'].join('\\n'));`,
    `${FS} for (const finding of findings) appendFileSync(out, \`\${JSON.stringify(finding)}\\n\`);`,
    `${FS} const config = JSON.parse(readFileSync('package.json', 'utf8')); use(config.name);`,
    `${FS} const parsed = JSON.parse(text); use(parsed.findings);`,
    `${FS} const lines = []; lines.push('a'); writeFileSync(out, lines.join('\\n'));`,
    `${FS} log(JSON.stringify(findings));`,
    `${FS} export function f(report) { writeFileSync(out, JSON.stringify(report)); }`,
    `${FS} const results = { ok: 1 }; writeFileSync(out, JSON.stringify(results));`,
  ],
  invalid: [
    write('writeFileSync(out, JSON.stringify(report.findings));'),
    write(`process.stdout.write(\`\${JSON.stringify({ findings })}\\n\`);`),
    write(
      'export function f(results) { writeFileSync(out, JSON.stringify(results, null, 2) + "\\n"); }',
    ),
    write(
      'const lines = []; for (const f of all) lines.push(f.path); writeFileSync(out, lines.join("\\n"));',
    ),
    write('const text = JSON.stringify(allFindings.map(toIssue)); appendFileSync(out, text);'),
    write('stream.write(JSON.stringify([...newFindings, ...oldFindings]));'),
    read("const report = JSON.parse(readFileSync(file, 'utf8')); use(report.findings);"),
    read("const { findings } = JSON.parse(readFileSync(file, 'utf8'));"),
    read("export async function f() { return JSON.parse(await readFile(file, 'utf8')).results; }"),
  ],
});
