import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './repeated-parse-per-item.mts';

const tester = typescriptRuleTester();

const REPEATED = (field: string) => ({ messageId: 'repeatedParsePerItem', data: { field } });

const HELPERS = `
type Finding = { message: string; rule: string; path: string; body: string; id: string };
function oneLine(text: string): string {
  return text.replace(/\\s+/gu, ' ').trim();
}
function splitRoute(text: string): string[] {
  return text.split(':').map((part) => part.trim());
}
`;

tester.run('repeated-parse-per-item', rule, {
  valid: [
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { const cache = new Map<string, string[]>(); return findings.map((item) => { const hit = cache.get(item.message); if (hit !== undefined) return hit; const parsed = splitRoute(oneLine(item.message)); cache.set(item.message, parsed); return parsed; }); }`,
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { const cache = new Map<string, string[]>(); const out: string[][] = []; for (const item of findings) { const key = item.message; const hit = cache.get(key); if (hit) { out.push(hit); continue; } const parsed = splitRoute(key); cache.set(key, parsed); out.push(parsed); } return out; }`,
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { return findings.slice(0, 10).map((item) => splitRoute(item.message)); }`,
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f() { return [{ message: 'a:b', rule: 'r', path: 'p', payload: '', id: '1' }].map((item) => splitRoute(item.message)); }`,
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}let count = 0; function stateful(text: string): string { count += 1; return text.trim(); } export function f(findings: Finding[]) { return findings.map((item) => stateful(item.message)); }`,
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}function withLog(text: string): string[] { console.log(text); return text.split(':'); } export function f(findings: Finding[]) { return findings.map((item) => withLog(item.message)); }`,
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { return findings.map((item) => splitRoute(item.id)); }`,
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { return findings.map((item) => item.message.trim()); }`,
    },
    {
      filename: 'src/format.test.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { return findings.map((item) => splitRoute(oneLine(item.message))); }`,
    },
  ],
  invalid: [
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { return findings.map((finding) => splitRoute(oneLine(finding.message))); }`,
      errors: [REPEATED('message')],
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { const out: unknown[] = []; for (const item of findings) { out.push(JSON.parse(item.body)); } return out; }`,
      errors: [REPEATED('body')],
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { return findings.map((item) => item.rule.split(/\\//u)); }`,
      errors: [REPEATED('rule')],
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { return findings.map((item) => item.path.trim().split('/')); }`,
      errors: [REPEATED('path')],
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { const out: string[][] = []; for (let i = 0; i < findings.length; i++) { out.push(splitRoute(findings[i].message)); } return out; }`,
      errors: [REPEATED('message')],
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}const PART = /^([a-z]+):/u; export function f(findings: Finding[]) { return findings.map((item) => PART.exec(item.rule)); }`,
      errors: [REPEATED('rule')],
    },
    {
      filename: 'src/format.mts',
      code: `${HELPERS}export function f(findings: Finding[]) { return findings.map(({ message }) => oneLine(message)); }`,
      errors: [REPEATED('message')],
    },
  ],
});
