import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-cache-per-inner-unit.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'cachePerPass' }] };
}

tester.run('no-cache-per-inner-unit', rule, {
  valid: [
    'export function f(file) { for (const decl of file.classes) { const s = new ns.SummaryCache(file); s.describe(decl); } }',
    'export function f(file) { const summaries = new SummaryCache(file); for (const decl of file.classes) { summaries.describe(decl); } }',
    'export function f(files) { for (const file of files) { const summaries = new SummaryCache(file); summaries.describe(); } }',
    'export function f(file) { const all = []; for (const decl of file.classes) { const summaries = new SummaryCache(file); all.push(summaries); } return all; }',
    'export function f(files) { for (const file of files) { const parsed = parse(file); const summaries = new SummaryCache(parsed); summaries.describe(); } }',
    'export function f(file) { for (const decl of file.classes) { const names = new Map(); names.set(decl.name, decl); } }',
    'export function f(file) { for (const decl of file.classes) { const summaries = new SummaryCache(); summaries.describe(decl); } }',
    'export function f(file) { return file.classes.map((decl) => { const summaries = new SummaryCache(file); return summaries; }); }',
    'export function f(file, out) { for (const decl of file.classes) { const summaries = new SummaryCache(file); out.push(new Holder(summaries)); } }',
    'export function f(file, out) { for (const decl of file.classes) { const summaries = new SummaryCache(file); register(summaries); } }',
    'export function f(r) { let line; while ((line = r.next()) !== null) { const c = new LineCache(line); c.run(); } }',
    'export function f(it) { while (it.hasNext()) { const c = new ItemCache(it.next()); c.run(); } }',
    'export function f(list) { let n = 0; for (const s of list) { const c = new NCache(n); c.run(s); n++; } }',
  ],
  invalid: [
    invalid(
      'export function f(files) { for (const file of files) { for (const decl of file.classes) { const summaries = new SummaryCache(file); summaries.describe(decl); } } }',
    ),
    invalid(
      'export function f(file, o) { for (const a of file.classes) { const summaries = new SummaryCache(o.a); summaries.describe(a); } }',
    ),
    invalid(
      'export function f(file) { for (const decl of file.classes) { const summaries = new SummaryCache(file); summaries.describe(decl); } }',
    ),
    invalid(
      'export function f(file, options) { file.classes.forEach((decl) => { const shared = new AnalysisShared(file, options); shared.run(decl); }); }',
    ),
  ],
});
