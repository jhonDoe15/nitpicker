import { typedTsProject } from '../../../test-support/projects/typed-ts-project.mts';
import { rule } from '../no-parameter-mutation.mts';

const project = typedTsProject('nitpicker-parameter-aliases-', {
  typeScriptOnly: true,
  lib: ['ES2022', 'DOM'],
});

function typed(code: string) {
  return { filename: project.write(code, 'ts'), code };
}

function flagged(code: string, messageId: string, name: string, callee?: string) {
  const data = callee === undefined ? { name } : { name, callee };
  return { ...typed(code), errors: [{ messageId, data }] };
}

const LET_ALIAS = [
  'export function redirect(init: number | ResponseInit = 302) {',
  '  let responseInit = init;',
  '  if (typeof responseInit === "number") { responseInit = { status: responseInit }; }',
  '  else if (responseInit.status === undefined) { responseInit.status = 302; }',
  '  return responseInit;',
  '}',
].join('\n');

project.tester.run('no-parameter-mutation aliases', rule, {
  valid: [
    typed(
      'export function f(items: string[]) { items = grow(items); return items; }\nfunction grow(list: string[]) { ' +
        'list.push("a"); return list; }',
    ),
    typed(
      LET_ALIAS.replace(
        'responseInit.status = 302;',
        'responseInit = { ...responseInit, status: 302 };',
      ),
    ),
    typed(
      'export function f(init: ResponseInit) { const next = { ...init }; next.status = 1; return next; }',
    ),
    typed(
      'export function f(init: ResponseInit) { let a = init; a = { ...a }; a.status = 1; return a; }',
    ),
    typed(
      'export function f(options: { args: string[] }) { const args = [...options.args]; strip(args, "x"); ' +
        '}\nfunction strip(list: string[], flag: string) { list.splice(0, 1); }',
    ),
    typed(
      'export function f(options: { args: string[] }) { strip(options.args.slice(), "x"); }\nfunction strip(list: ' +
        'string[], flag: string) { list.splice(0, 1); }',
    ),
    typed(
      'export function f(options: { args: string[] }) { return count(options.args); }\nfunction count(list: ' +
        'string[]) { return list.length; }',
    ),
    typed(
      'export function f(options: { args: string[] }) { const extra: string[] = []; strip(extra, options.args); ' +
        '}\nfunction strip(list: string[], other: string[]) { list.splice(0, other.length); }',
    ),
    typed(
      'export function f(options: { lib: { entry: string } }) { const copy = { ...options, lib: { ...options.lib } ' +
        '}; copy.lib.entry = "x"; return copy; }',
    ),
    typed(
      'export function f(options: { lib: { entry: string } }) { const copy = { ...options }; copy.lib = { ' +
        '...copy.lib }; copy.lib.entry = "x"; return copy; }',
    ),
    typed(
      'export function f(options: { lib: { entry: string } }) { const copy = { ...options }; copy.lib = { entry: ' +
        '"y" }; return copy; }',
    ),
    typed(
      'export function f(options: { lib: { entry: string } }) { const copy = { ...options, lib: { entry: "y" } }; ' +
        'copy.lib.entry = "x"; return copy; }',
    ),
    typed(
      'export function f(options: { lib: { entry: string } }) { const copy = structuredClone(options); ' +
        'copy.lib.entry = "x"; return copy; }',
    ),
    typed(
      'export function f(options: { a: number }) { const o = { a: 1 }; Object.defineProperty(o, "a", { value: 2 }); ' +
        'return o; }',
    ),
    typed(
      'export function f(options: { a: number }) { return Object.defineProperty({}, "a", { value: options.a }); }',
    ),
    typed(
      'export function f(options: { lib: { entry: string } }) { const local = { lib: { entry: "" } }; const copy = ' +
        '{ ...local }; copy.lib.entry = "x"; return options; }',
    ),
  ],
  invalid: [
    flagged(LET_ALIAS, 'propertyWrite', 'responseInit.status'),
    flagged(
      'export function f(items: string[]) { drop(items); drop(items); }\nfunction drop(list: string[]) { list.pop(); }',
      'helperMutation',
      'items',
      'drop',
    ),
    flagged(
      'export function f(options: { args: string[] }) { strip(options.args, "x"); }\nfunction strip(list: string[], ' +
        'flag: string) { list.splice(0, 1); }',
      'helperMutation',
      'options.args',
      'strip',
    ),
    flagged(
      'export function f(items: string[]) { drop(items); }\nfunction drop(list: string[]) { list.pop(); }',
      'helperMutation',
      'items',
      'drop',
    ),
    flagged(
      'export function f(user: { name: string }) { rename(user); }\nconst rename = (target: { name: string }) => { ' +
        'target.name = "x"; };',
      'helperMutation',
      'user',
      'rename',
    ),
    flagged(
      'export function f(options: { lib: { entry: string } }, defaults: { lib: { entry: string } }) { const merged ' +
        '= { ...defaults, ...options }; merged.lib.entry = "x"; return merged; }',
      'propertyWrite',
      'merged.lib.entry',
    ),
    flagged(
      'export function f(options: { lib: { entry: string } }) { const merged = Object.assign({}, options); ' +
        'merged.lib.entry = "x"; return merged; }',
      'propertyWrite',
      'merged.lib.entry',
    ),
    flagged(
      'export function f(options: { args: string[] }) { const merged = { ...options }; merged.args.push("x"); ' +
        'return merged; }',
      'parameterMutation',
      'merged.args.push',
    ),
    flagged(
      'export function f(defaults: { lib: { entry: string } }, options: { lib: { entry: string } }) { const merged ' +
        '= withDefaults(defaults, options); merged.lib.entry = "x"; return merged; }\nfunction withDefaults<T>(a: T, ' +
        'b: T): T { return { ...a, ...b }; }',
      'propertyWrite',
      'merged.lib.entry',
    ),
    flagged(
      'export function f(hmr: { port: number }) { const proxy = hmr; Object.defineProperty(proxy, "port", { get() { ' +
        'return 1; } }); }',
      'propertyWrite',
      'Object.defineProperty(proxy, …)',
    ),
    flagged(
      'export function f(hmr: { port?: number } | undefined) { const proxy = hmr || {}; ' +
        'Object.defineProperty(proxy, "port", { value: 1 }); }',
      'propertyWrite',
      'Object.defineProperty(proxy, …)',
    ),
    flagged(
      'export function f(hmr: { port: number }) { Object.defineProperties(hmr, { port: { value: 1 } }); }',
      'propertyWrite',
      'Object.defineProperties(hmr, …)',
    ),
  ],
});
