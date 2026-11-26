import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-loop-invariant-copy.mts';

const messageId = 'copyPerPass';

function COPY(copy: string, source: string) {
  return { messageId, data: { copy, source } };
}

const EXPECTED = [
  [COPY('[...sourceLines]', 'sourceLines')],
  [COPY('lines.slice()', 'lines')],
  [COPY('structuredClone(options)', 'options')],
  [COPY('new Set(seen)', 'seen')],
  [COPY('{ ...this.base }', 'this.base')],
  [COPY('Array.from(lines)', 'lines')],
];

const tester = typescriptRuleTester();
const cases = (block: string) => block.trim().split('\n\n');

tester.run('no-loop-invariant-copy', rule, {
  valid: cases(`
export function f(xs: Row[], buf: number[], history: number[][]) { for (const x of xs) { fill(buf, x); history.push([...buf]); } }
declare function fill(b: number[], x: Row): void;

export function f(xs: Row[], cfg: { opts: object }) { for (const x of xs) { use({ opts: { ...cfg.opts }, x }); } }
declare function use(o: object): void;

export function f(xs: Row[], lines: string[], out: Report[]) { for (const x of xs) { const copy = [...lines]; copy.push(x.id); out.push({ x, copy }); } }

export function f(xs: Row[], lines: string[], out: Report[]) { for (const x of xs) { lines.push(x.id); out.push({ x, lines: [...lines] }); } }

export function f(xs: Row[], out: Report[]) { for (const x of xs) { out.push({ x, lines: [...x.lines] }); } }

export function f(xs: Row[], out: Report[]) { let lines: string[] = []; for (const x of xs) { lines = x.lines; out.push({ x, lines: [...lines] }); } }

export function f(xs: Row[], out: Report[]) { const lines = ["a", "b"]; for (const x of xs) { out.push({ x, lines: [...lines] }); } }

export function f(lines: string[], out: Report[]) { for (const x of [1, 2]) { out.push({ x, lines: [...lines] }); } }

export function f(lines: string[], out: Report[]) { out.push({ lines: [...lines] }); }

export function f(xs: Row[], lines: string[]) { for (const x of xs) { send([...lines], x); } }
declare function send(lines: string[], x: Row): void;

export function f(xs: Row[], lines: string[]) { for (const x of xs) { const [a] = [...lines]; use(a, x); } }
declare function use(a: unknown, x: Row): void;

export function f(xs: Row[], lines: string[], out: string[][]) { for (const x of xs) { out.push(lines.slice(x.from)); } }

export function f(xs: Row[], lines: string[], out: Report[]) { for (const x of xs) { out.push({ x, lines: [...lines, x.id] }); } }
`),
  invalid: cases(`
export function f(findings: Finding[], sourceLines: string[], reports: Report[]) { for (const finding of findings) { reports.push({ finding, lines: [...sourceLines] }); } }

export function f(findings: Finding[], text: string) { const lines = text.split("\\n"); return findings.map((finding) => ({ finding, lines: lines.slice() })); }

export function f(findings: Finding[], options: Options) { return findings.map((finding) => structuredClone(options)); }

export function f(xs: Row[], seen: Set<string>, out: Map<string, Set<string>>) { for (const x of xs) { out.set(x.id, new Set(seen)); } }

export class A { private readonly base: Options = { a: 1 }; build(xs: Row[]) { return xs.map((x) => { return new Report(x, { ...this.base }); }); } }
declare class Report { constructor(x: Row, o: Options) }

export function f(xs: Row[], lines: string[], out: Record<string, string[]>) { for (const x of xs) { out[x.id] = Array.from(lines); } }
`).map((code, index) => ({ code, errors: EXPECTED[index] ?? [] })),
});
