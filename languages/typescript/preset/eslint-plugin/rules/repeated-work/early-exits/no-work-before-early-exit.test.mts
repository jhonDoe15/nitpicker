import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-work-before-early-exit.mts';

const tester = typescriptRuleTester();

const WORK = (name: string) => ({ messageId: 'workBeforeExit', data: { name } });
const FS =
  'import { readFile, readFileSync } from "node:fs";\nimport fs from "node:fs/promises";\n';

tester.run('no-work-before-early-exit', rule, {
  valid: [
    'export function f(node: ts.Node, checker: ts.TypeChecker) { const type = checker.getTypeAtLocation(node); if (!ts.isCallExpression(node)) return; use(type); }\ndeclare function use(t: ts.Type): void;',
    'export function f(nodes: ts.Node[], checker: ts.TypeChecker) { for (const node of nodes) { const type = checker.getTypeAtLocation(node); if (!accepts(node)) continue; use(type); } }\ndeclare function accepts(n: ts.Node): boolean;\ndeclare function use(t: ts.Type): void;',
    'export function f(nodes: ts.Node[], checker: ts.TypeChecker) { for (const node of nodes) { const type = checker.getTypeAtLocation(node); if (!isWanted(type)) continue; use(type); } }\ndeclare function isWanted(t: ts.Type): boolean;\ndeclare function use(t: ts.Type): void;',
    'export function f(nodes: ts.Node[], checker: ts.TypeChecker) { for (const node of nodes) { const type = checker.getTypeAtLocation(node); if (!ts.isCallExpression(node.getChildAt(0))) continue; use(type); } }\ndeclare function use(t: ts.Type): void;',
    'export function f(text: string, enabled: boolean) { const parsed = JSON.parse(text); if (!enabled) return []; return parsed; }',
    `${FS}export async function f(path: string, enabled: boolean) { const text = await fs.readFile(path, "utf8"); if (!enabled) { return ""; } return text; }`,
    `${FS}export function f(paths: string[], skip: Set<string>) { for (const path of paths) { const text = readFileSync(path, "utf8").split("\\n").filter((line) => line.length > 0); if (path === "") continue; console.log(text); } }`,
    'export function f(items: number[], bad: boolean) { function cleanup() { return rows.length; } const rows = items.map((x) => x + 1); if (bad) { cleanup(); return []; } return rows; }',
    'export function f(rows: number[], key?: number) { const found = key === undefined ? undefined : rows.find((row) => row === key); if (key === undefined) return 0; return found; }',
    'export function f(rows: number[], ready: boolean) { const found = ready && rows.some((row) => row > 1); if (!ready) return false; return found; }',
    'export function f(text: string, enabled: boolean) { if (!enabled) return []; const parsed = JSON.parse(text); return parsed; }',
    'export function f(text: string) { const parsed = JSON.parse(text); if (!parsed.ok) return []; return parsed; }',
    'export function f(rows: number[], enabled: boolean) { const total = rows.length; if (!enabled) return 0; return total; }',
    'export function f(rows: number[], enabled: boolean) { const doubled = rows.map((row) => audit(row)); if (!enabled) return []; return doubled; }\ndeclare function audit(row: number): number;',
    'export function f(rows: number[]) { const doubled = rows.map((row) => row * 2); if (!check()) return []; return doubled; }\ndeclare function check(): boolean;',
    'export function f(rows: number[], enabled: boolean) { const doubled = rows.map((row) => row * 2); if (!enabled) { log(doubled); return []; } return doubled; }\ndeclare function log(value: unknown): void;',
    'export function f(rows: number[], enabled: boolean) { const doubled = rows.map((row) => row * 2); if (!enabled) { return []; } else { return doubled; } }',
    'export function f(rows: number[], enabled: boolean) { const sorted = rows.sort(); if (!enabled) return []; return sorted; }',
    'export function f(rows: number[], enabled: boolean) { const doubled = rows.map((row) => row * 2); console.log(enabled); if (!enabled) return []; return doubled; }',
    'export function f(enabled: boolean) { const started = Date.now(); if (!enabled) return 0; return started; }',
    'export function f(enabled: boolean) { const id = createId(); if (!enabled) return ""; return id; }\ndeclare function createId(): string;',
    `${FS}export async function f(path: string, job: { cancelled: boolean }) { const text = await fs.readFile(path, "utf8"); if (job.cancelled) return ""; return text; }`,
    `${FS}export function f(path: string, enabled: boolean) { const text = readFileSync(path, "utf8"); if (!enabled) return ""; }`,
    'export function f(nodes: ts.Node[], checker: ts.TypeChecker) { for (const node of nodes) { const type = checker.getTypeAtLocation(node); if (!ts.isCallExpression(node.getChildAt(0)) || skip) continue; use(type); } }\ndeclare const skip: boolean;\ndeclare function use(t: ts.Type): void;',
    'export function f(nodes: ts.Node[], checker: ts.TypeChecker, method: "getTypeAtLocation") { for (const node of nodes) { const type = checker[method](node); if (!ts.isCallExpression(node)) continue; use(type); } }\ndeclare function use(t: ts.Type): void;',
    'export function f(nodes: ts.Node[], make: () => ts.TypeChecker) { for (const node of nodes) { const type = make().getTypeAtLocation(node); if (!ts.isCallExpression(node)) continue; use(type); } }\ndeclare function use(t: ts.Type): void;',
    'export function f(nodes: ts.Node[], checker: ts.TypeChecker, tests: Record<number, (n: ts.Node) => boolean>) { for (const node of nodes) { const type = checker.getTypeAtLocation(node); if (!tests[node.kind](node)) continue; use(type); } }\ndeclare function use(t: ts.Type): void;',
    'export function f(rows: number[], enabled: boolean) { let doubled = rows.map((row) => row * 2); if (!enabled) return []; doubled = []; return doubled; }',
  ],
  invalid: [
    {
      code: 'export async function f(source: object, enabled: boolean) { const keys = await Object.keys(source); if (!enabled) return []; return keys; }',
      errors: [WORK('keys')],
    },
    {
      code: 'export function f(nodes: ts.Node[], checker: ts.TypeChecker) { for (const node of nodes) { const type = checker.getTypeAtLocation(node); if (!ts.isCallExpression(node)) continue; use(type); } }\ndeclare function use(t: ts.Type): void;',
      errors: [WORK('type')],
    },
    {
      code: 'export function f(nodes: ts.Node[], program: { checker: ts.TypeChecker }) { nodes.forEach((node) => { const symbol = program.checker.getSymbolAtLocation(node); if (!isNamed(node) || skip) return; use(symbol); }); }\ndeclare const skip: boolean;\ndeclare function isNamed(n: ts.Node): boolean;\ndeclare function use(t: unknown): void;',
      errors: [WORK('symbol')],
    },
    {
      code: 'export function f(rows: { due: boolean }[], active: boolean) { const due = rows.filter((row) => row.due).map((row) => ({ ...row })); if (!active) throw new Error("inactive"); return due; }',
      errors: [WORK('due')],
    },
    {
      code: 'export function f(source: Record<string, number>, options: { enabled: boolean }) { const index = new Map(Object.entries(source)); if (!options.enabled) return undefined; return index; }',
      errors: [WORK('index')],
    },
    {
      code: 'export function f(rows: number[], other: number[], enabled: boolean) { const seen = new Set(other); if (!enabled) return []; return rows.filter((row) => seen.has(row)); }',
      errors: [WORK('seen')],
    },
  ],
});
