import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { rule } from './no-empty-every-signal.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-empty-every-');
afterAll(cleanup);

const HEADER =
  'type Tool = { status: string; id: string };\ndeclare function stopAgent(): void;\ndeclare function ' +
  'markDone(): void;\n';

function found(list: string) {
  return [{ messageId: 'emptyEvery', data: { list } }];
}

tester.run('no-empty-every-signal', rule, {
  valid: [
    'export function f(tools: Tool[]) { const allCancelled = tools.length > 0 && tools.every((t) => t.status === ' +
      '"x"); return allCancelled; }',
    'export function f(tools: Tool[]) { if (tools.length === 0) { return false; } const allDone = ' +
      'tools.every((t) => t.status === "x"); return allDone; }',
    'export function f(tools: Tool[]) { const allDone = tools.some((t) => t.id === "a") && tools.every((t) => ' +
      't.status === "x"); return allDone; }',
    'export function f(tools: Tool[]) { const done = tools.every((t) => t.status === "x"); return done; }',
    'export function f(tools: Tool[]) { const valid = tools.every((t) => t.status === "x"); return valid; }',
    'export function f(tools: Tool[]) { if (tools.every((t) => t.status === "x")) { console.log("all"); } }',
    'export function f(tools: Tool[]) { if (tools.length && tools.every((t) => t.status === "x")) { stopAgent(); } }',
    'export function f(tools: [Tool, Tool]) { const allDone = tools.every((t) => t.status === "x"); return allDone; }',
    'export function f(tools: Tool[]) { const local = [{ status: "x", id: "a" }]; const allDone = ' +
      'local.every((t) => t.status === "x"); return allDone; }',
    'export function f(tools: Tool[]) { const remaining = tools.filter((t) => t.id !== "a"); if ' +
      '(remaining.length === 0) { return; } const allDone = remaining.every((t) => t.status === "x"); return ' +
      'allDone; }',
    'export function f(tools: Tool[]) { return tools.every((t) => t.status === "x"); }',
    'export function f(tools: Tool[]) { const allDone = isNonEmpty(tools) && tools.every((t) => t.status === ' +
      '"x"); return allDone; }\ndeclare function isNonEmpty(x: unknown[]): boolean;',
    'export function f(tools: Tool[]) { if (tools.every((t) => t.status === "x")) { endpointStatus(); } ' +
      '}\ndeclare function endpointStatus(): void;',
    'export function f(tools: Tool[]) { if (!tools.every((t) => t.status === "x")) { return; } }',
    'export function f(tools: Tool[]) { if (tools.every((t) => t.status === "x")) { markUnrelated(); } ' +
      '}\ndeclare function markUnrelated(): void;',
    'declare const o: { items: Tool[] };\n' +
      'const allDone = o.items.length > 0 && o.items.every((t) => t.status === "x");',
  ].map((body) => typed(`${HEADER}${body}`)),
  invalid: [
    typed(
      `${HEADER}declare const o: { items: Tool[] };\n` +
        'const allDone = o.items.every((t) => t.status === "x"); if (allDone) { stopAgent(); }',
      found('o.items'),
    ),
    typed(
      `${HEADER}declare const tools: Tool[];\nconst pending = tools.filter((t) => t.id !== "a");\nexport const ` +
        `allDone = pending.every((t) => t.id === "b");`,
      found('pending'),
    ),
    typed(
      `${HEADER}export function f(tools?: Tool[]) { const allDone = tools?.every((t) => t.status === "x"); ` +
        `return allDone; }`,
      found('tools'),
    ),
    typed(
      `${HEADER}export function f(tools: Tool[]) { const allToolsCancelled = tools.every((t) => t.status === ` +
        `"cancelled"); if (allToolsCancelled) { stopAgent(); } }`,
      found('tools'),
    ),
    typed(
      `${HEADER}export function f(tools: Tool[]) { const pending = tools.filter((t) => t.status !== "x"); const ` +
        `allDone = pending.every((t) => t.id.length > 0); return allDone; }`,
      found('pending'),
    ),
    typed(
      `${HEADER}export function f(tools: Tool[]) { const allReady = tools.filter((t) => t.id !== "a").every((t) ` +
        `=> t.status === "x"); return allReady; }`,
      found('tools.filter((t) => t.id !== "a")'),
    ),
    typed(
      `${HEADER}export function f(tools: Tool[]) { if (tools.every((t) => t.status === "cancelled")) { ` +
        `stopAgent(); } }`,
      found('tools'),
    ),
    typed(
      `${HEADER}export class A { tools: Tool[] = []; run() { return this.tools.every((t) => t.status === "x") ? ` +
        `this.finish() : 0; } finish() { return 1; } }`,
      found('this.tools'),
    ),
    typed(
      `${HEADER}export class A { tools: Tool[] = []; run() { const allDone = this.tools.every((t) => t.status ` +
        `=== "x"); return allDone; } }`,
      found('this.tools'),
    ),
  ],
});
