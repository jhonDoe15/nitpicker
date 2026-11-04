import { createRuleTester } from './test-support/rule-tester.mjs';
import { rule as noBranchInCompositionRoot } from '../boundaries/no-branch-in-composition-root.mjs';
import { rule as noHandwrittenBoundaryGuard } from '../boundaries/no-handwritten-boundary-guard.mjs';
import { rule as noManagedResource } from '../boundaries/no-managed-resource-construction-outside-composition-roots.mjs';
import { rule as noSelfRecursion } from '../control/no-self-recursion.mjs';
import { rule as noUnknownInDomain } from '../boundaries/no-unknown-in-domain.mjs';
import { rule as noUnvalidatedSchemaField } from '../boundaries/no-unvalidated-schema-field.mjs';
import { rule as preserveErrorCause } from '../errors/preserve-error-cause.mjs';
import { rule as reportModuleLoadEffects } from '../modules/report-module-load-effects.mjs';

const tester = createRuleTester();
const root = '/repo/src/main/composition-root.ts';

tester.run('preserve-error-cause for Error subclasses', preserveErrorCause, {
  valid: [
    'try { run(); } catch (error) { throw new AppError("failed", { cause: error }); }',
    'try { run(); } catch (error) { throw new AppError("failed", 500, { cause: error }); }',
    'try { run(); } catch (error) { throw new WrapError("failed", error); }',
    'try { run(); } catch { return new AppError("failed"); }',
    'try { run(); } catch (error) { const failure = new AppError("failed", { cause: error }); throw failure; }',
    'try { run(); } catch (error) { return Promise.reject(new AppError("failed", { cause: error })); }',
    'try { run(); } catch (error) { const failure = new AppError("failed"); return failure; }',
    'try { run(); } catch (error) { throw new Wrapper(String(error)); }',
    'try { run(); } catch (error) { throw new AggregateError([error, other], "run and close failed"); }',
    'try { run(); } catch (error) { const cause = error; throw new AppError("bad", { cause }); }',
  ],
  invalid: [
    {
      code: 'try { run(); } catch (error) { throw new AggregateError([other], "failed"); }',
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: 'try { run(); } catch (error) { const cause = String(error); throw new AppError("bad", { cause: other }); }',
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: 'try { run(); } catch (error) { throw new AppError(String(error)); }',
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: 'try { run(); } catch (error) { throw new AppError(`bad ${error instanceof Error ? error.message : "x"}`); }',
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: 'try { run(); } catch (error) { throw new TypeError(String(error), { cause: other }); }',
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: 'try { run(); } catch (error) { throw new Error(String(error)); }',
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: 'try { run(); } catch (error) { log(error); throw new AppError("range"); }',
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: 'try { run(); } catch { throw new AppError("failed"); }',
      errors: [{ messageId: 'bindingLess' }],
    },
    {
      code: 'try { run(); } catch (error) { log(error); const failure = new AppError("failed"); throw failure; }',
      errors: [{ messageId: 'lostCause' }],
    },
    {
      code: 'try { run(); } catch (error) { log(error); return Promise.reject(new AppError("failed")); }',
      errors: [{ messageId: 'lostCause' }],
    },
  ],
});

tester.run('no-self-recursion through references and cycles', noSelfRecursion, {
  valid: [
    'function a() { return b(); } function b() { return 1; }',
    'function walk(node) { return node.children; } const all = nodes.flatMap(walk);',
    'function outer() { function inner() { return 1; } return inner(); }',
    'const a = () => b(); const b = () => c(); const c = () => 1;',
    {
      code: 'function TreeNode({ node }) { return <ul>{node.children.map((child) => <TreeNode node={child} />)}</ul>; }',
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    },
    'function poll() { setTimeout(poll, 1000); }',
    'function onMessage(event) { emitter.off("message", onMessage); }',
    'function watch() { emitter.on("change", () => watch()); }',
    'function start() { window.addEventListener("load", function onLoad() { start(); }); }',
    'function outer() { const run = () => helper(); return run; } function helper() { return outer(); }',
    'function poll() { const timer = setTimeout(() => poll(), 1000); return timer; }',
    'function later() { schedule(() => later()); }',
  ],
  invalid: [
    {
      code: 'function flatten(node) { return [node.name, ...node.children.flatMap(flatten)]; }',
      errors: [{ messageId: 'recursion', data: { name: 'flatten' } }],
    },
    {
      code: 'const walk = (node) => node.children.map(walk);',
      errors: [{ messageId: 'recursion' }],
    },
    {
      code: 'function evens(n) { return n === 0 || odds(n - 1); } function odds(n) { return n !== 0 && evens(n - 1); }',
      errors: [{ messageId: 'mutualRecursion', data: { name: 'evens', other: 'odds' } }],
    },
    {
      code: 'const a = () => b(); const b = () => c(); const c = () => a();',
      errors: [{ messageId: 'mutualRecursion' }],
    },
    {
      filename: '/repo/src/main/features/a/domain/tree.ts',
      code: 'function flatten(node) { return node.children.flatMap(flatten); }',
      errors: [{ messageId: 'domainRecursion' }],
    },
    {
      code: 'function a() { function b() { return a(); } return b(); }',
      errors: [{ messageId: 'recursion', data: { name: 'a' } }],
    },
    {
      code: 'function walk(node) { node.children.forEach((child) => walk(child)); }',
      errors: [{ messageId: 'recursion', data: { name: 'walk' } }],
    },
    {
      code: 'function a() { const b = () => a(); return b(); }',
      errors: [{ messageId: 'recursion', data: { name: 'a' } }],
    },
    {
      code: 'function outer() { const run = () => helper(); return run(); } function helper() { return outer(); }',
      errors: [{ messageId: 'mutualRecursion', data: { name: 'outer', other: 'run' } }],
    },
    {
      code: 'async function crawl(url) { const links = await fetchLinks(url); return Promise.all(links.map((link) => limit(() => crawl(link)))); }',
      errors: [{ messageId: 'recursion', data: { name: 'crawl' } }],
    },
    {
      code: 'async function retry(job) { return await withLock(() => retry(job)); }',
      errors: [{ messageId: 'recursion', data: { name: 'retry' } }],
    },
  ],
});

tester.run('no-unknown-in-domain through aliases', noUnknownInDomain, {
  valid: [
    'type Raw = string; export function f(value: Raw) { return value; }',
    'type Raw = unknown; export function f(): Raw { return 1; }',
    'type Raw<T> = unknown; export function f(value: Raw<string>) { return value; }',
    'export function f(value: Missing) { return value; }',
    'type Raw = unknown; type Row = { readonly cause: Raw };',
    'type A = B; type B = A; export function f(value: A) { return value; }',
    'type Failure = { readonly cause: unknown }; export function f(failure: Failure) { return failure; }',
    'type Make = <T = unknown>() => T; export function f(make: Make) { return make; }',
  ],
  invalid: [
    {
      code: 'type Raw = unknown; export function f(value: Raw) { return value; }',
      errors: [{ messageId: 'unknownType' }],
    },
    {
      code: 'type Raw = unknown; type Alias = Raw; export function f(value: Alias) { return value; }',
      errors: [{ messageId: 'unknownType' }],
    },
    {
      code: 'type Raw = unknown; export type Row = { readonly payload: Raw };',
      errors: [{ messageId: 'unknownType' }],
    },
    {
      code: 'type JsonObject = Readonly<Record<string, unknown>>; export function f(payload: JsonObject) { return payload; }',
      errors: [{ messageId: 'unknownType' }],
    },
    {
      code: 'type Bag = Record<string, unknown>; type Event = { readonly bag: Bag };',
      errors: [{ messageId: 'unknownType' }],
    },
    {
      code: 'type Items = readonly unknown[]; type Batch = Items; type Event = { readonly items: Batch };',
      errors: [{ messageId: 'unknownType' }],
    },
  ],
});

tester.run('no-unvalidated-schema-field loose forms', noUnvalidatedSchemaField, {
  valid: [
    'const Event = Base.extend({ payload: z.string(), tags: z.string().array() });',
    'const options = defaults.extend({ payload: unknownThing() });',
    'const s = z.object({ a: z.string(), b: z.array(z.string()) });',
    'const s = z.object({ a: z.record(z.string(), z.number()) });',
    'const s = z.object({ a: z.custom<A>((v) => isA(v)) });',
    'const s = z.strictObject({ a: z.string() });',
    'const any = z.string(); const s = z.object({ a: any });',
    'const s = z.object({ a: z.string() }).catchall(z.string());',
    'const s = other.object({ a: other.string() }).passthrough();',
  ],
  invalid: [
    {
      code: 'const Base = z.object({ id: z.string() }); const Event = Base.extend({ payload: z.unknown() });',
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: 'const Event = Base.safeExtend({ payload: z.any() });',
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: 'const Batch = z.object({ items: z.unknown().array() });',
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: 'const Opt = z.object({ extra: z.optional(z.any()), more: z.nullable(z.unknown()) });',
      errors: [{ messageId: 'unvalidatedField' }, { messageId: 'unvalidatedField' }],
    },
    {
      code: 'const s = z.object({ a: z.record(z.string(), z.unknown()) });',
      errors: [{ messageId: 'unvalidatedField', data: { factory: 'z.unknown' } }],
    },
    {
      code: 'const s = z.object({ a: z.array(z.any()) });',
      errors: [{ messageId: 'unvalidatedField', data: { factory: 'z.any' } }],
    },
    {
      code: 'const anything = z.any(); const s = z.object({ a: anything });',
      errors: [{ messageId: 'unvalidatedField' }],
    },
    {
      code: 'const s = z.object({ a: z.custom<{ readonly a: number }>() });',
      errors: [{ messageId: 'customWithoutValidator' }],
    },
    {
      code: 'const s = z.looseObject({ a: z.string() });',
      errors: [{ messageId: 'looseObject' }],
    },
    {
      code: 'const s = z.object({ a: z.string() }).catchall(z.unknown());',
      errors: [{ messageId: 'looseObject' }],
    },
    {
      code: 'const s = z.object({ a: z.string() }).passthrough();',
      errors: [{ messageId: 'looseObject' }],
    },
    {
      code: 'const s = z.object({ a: z.string() }).loose();',
      errors: [{ messageId: 'looseObject' }],
    },
  ],
});

tester.run('no-handwritten-boundary-guard by input type', noHandwrittenBoundaryGuard, {
  valid: [
    'const ok = results.filter((result: Result): result is Ok => result.kind === "ok");',
    'function isOk(result: Ok | Failed): result is Ok { return result.kind === "ok"; }',
    'function isOk(result): result is Ok { return true; }',
    'function f(value: unknown) { return value instanceof Error ? value.message : String(value); }',
    'function f(value: unknown) { return typeof value === "string"; }',
    'function f(value: Row) { return "a" in value; }',
    'function f(value: unknown) { return key in value; }',
    'function overload(text: string): Ok; function overload(text: string): Ok | Failed { return text; }',
    'function overload(text: string): unknown { return text; }',
    "function code(error: unknown) { return error instanceof Error && 'code' in error && error.code === 'ENOENT'; }",
    "function code(error: unknown) { if (error instanceof Error) { return 'code' in error; } return false; }",
    "function code(error: unknown) { if (!(error instanceof Error)) { return false; } return 'code' in error; }",
    "function code(error: unknown) { return error instanceof Error ? 'code' in error : false; }",
    "function code(error: unknown) { return !(error instanceof Error) || 'code' in error; }",
    "function code(error: unknown) { return !(error instanceof Error) ? false : 'code' in error; }",
    "function code(error: unknown, quiet: boolean) { if (!(error instanceof Error) || quiet) { throw error; } return 'code' in error; }",
    "function code(error: unknown) { const isError = error instanceof Error; return isError && 'code' in error; }",
    "function code(error: unknown) { switch (true) { case error instanceof Error: return 'code' in error; default: return false; } }",
    "function code(error: unknown) { return error instanceof HttpError && 'code' in error; }",
    "function issues(error: unknown) { return error instanceof z.ZodError && 'issues' in error; }",
  ],
  invalid: [
    {
      code: 'function isPoint(value: unknown): value is Point { return true; }',
      errors: [{ messageId: 'typePredicate' }],
    },
    {
      code: 'const isPoint = (value: any): value is Point => true;',
      errors: [{ messageId: 'typePredicate' }],
    },
    {
      code: 'function isPoint(value: Record<string, unknown>): value is Point { return true; }',
      errors: [{ messageId: 'typePredicate' }],
    },
    {
      code: 'function parse(raw: unknown) { if (typeof raw === "object" && raw !== null && "name" in raw) { return raw; } return undefined; }',
      errors: [{ messageId: 'inlineNarrowing' }, { messageId: 'inlineNarrowing' }],
    },
    {
      code: 'function parse(raw: unknown) { const known: unknown = raw; return "name" in known; }',
      errors: [{ messageId: 'inlineNarrowing' }],
    },
    {
      code: "function code(error: unknown, other: unknown) { return other instanceof Error && 'code' in error; }",
      errors: [{ messageId: 'inlineNarrowing' }],
    },
    {
      code: "function code(error: unknown) { return error instanceof Error || 'code' in error; }",
      errors: [{ messageId: 'inlineNarrowing' }],
    },
    {
      code: "function code(error: unknown) { if (!(error instanceof Error)) { log(error); } return 'code' in error; }",
      errors: [{ messageId: 'inlineNarrowing' }],
    },
    {
      code: "function code(error: unknown) { let isError = error instanceof Error; isError = true; return isError && 'code' in error; }",
      errors: [{ messageId: 'inlineNarrowing' }],
    },
    {
      code: "function code(error: unknown) { switch (kind) { case error instanceof Error: return 'code' in error; default: return false; } }",
      errors: [{ messageId: 'inlineNarrowing' }],
    },
    {
      code: "function code(error: unknown) { return !(error instanceof Error) && 'code' in error; }",
      errors: [{ messageId: 'inlineNarrowing' }],
    },
    {
      code: "function id(data: unknown) { return data instanceof Object && 'id' in data; }",
      errors: [{ messageId: 'inlineNarrowing' }],
    },
    {
      code: "function name(data: unknown) { if (!(data instanceof Object)) { return undefined; } return 'name' in data; }",
      errors: [{ messageId: 'inlineNarrowing' }],
    },
    {
      code: "function name(data: unknown) { return data instanceof Map && 'size' in data; }",
      errors: [{ messageId: 'inlineNarrowing' }],
    },
    {
      code: 'export function copy(value: Row) { return JSON.parse(JSON.stringify(value)); }',
      errors: [{ messageId: 'jsonCopy' }],
    },
    {
      code: 'export function overload(text: string): Ok; export function overload(text: string): unknown { return text; }',
      errors: [{ messageId: 'overloadCast' }],
    },
  ],
});

tester.run('no-managed-resource-construction anchored root and factories', noManagedResource, {
  valid: [
    { filename: '/repo/src/main/server.ts', code: 'const server = http.createServer();' },
    { filename: '/repo/src/server.ts', code: 'const server = http.createServer();' },
    { filename: '/repo/src/main.ts', code: 'const pool = createPool();' },
    { filename: '/repo/src/main/composition-root/wire.ts', code: 'const client = createClient();' },
    {
      filename: '/repo/src/main/features/a/adapters/x.ts',
      code: 'const id = createId(); const m = new Map();',
    },
    {
      filename: '/repo/src/main/features/a/adapters/x.ts',
      code: 'const a = new AbortController();',
    },
  ],
  invalid: [
    {
      filename: '/repo/src/main/features/a/adapters/server.ts',
      code: 'const client = new PaymentClient();',
      errors: [{ messageId: 'outsideRoot' }],
    },
    {
      filename: '/repo/src/main/features/a/adapters/x.ts',
      code: 'http.createServer().listen(3000);',
      errors: [{ messageId: 'outsideRoot', data: { name: 'createServer' } }],
    },
    {
      filename: '/repo/src/main/features/a/adapters/x.ts',
      code: 'const api = axios.create({ baseURL: url }); const pool = mysql.createPool(options);',
      errors: [{ messageId: 'outsideRoot' }, { messageId: 'outsideRoot' }],
    },
    {
      filename: '/repo/src/main/features/a/adapters/x.ts',
      code: 'const a = new EventEmitter(); const b = new Worker("./w.js"); const c = new Redis(); const d = new DatabaseSync(":memory:");',
      errors: [
        { messageId: 'outsideRoot' },
        { messageId: 'outsideRoot' },
        { messageId: 'outsideRoot' },
        { messageId: 'outsideRoot' },
      ],
    },
  ],
});

tester.run('no-branch-in-composition-root defaults and loops', noBranchInCompositionRoot, {
  valid: [
    { filename: root, code: 'const ready = left || right; const label = a && b();' },
    { filename: root, code: 'try { main(); } catch (error) { report(error); }' },
    {
      filename: '/repo/src/main/features/a/adapters/x.ts',
      code: 'const port = Number(process.env["PORT"] || 3000);',
    },
  ],
  invalid: [
    {
      filename: root,
      code: 'const port = Number(process.env["PORT"] || 3000);',
      errors: [{ messageId: 'branch' }],
    },
    { filename: root, code: 'const names = args || [];', errors: [{ messageId: 'branch' }] },
    { filename: root, code: 'const config = input || load();', errors: [{ messageId: 'branch' }] },
    {
      filename: root,
      code: 'for (const name of names) { register(name); }',
      errors: [{ messageId: 'branch' }],
    },
    { filename: root, code: 'while (more()) { step(); }', errors: [{ messageId: 'branch' }] },
  ],
});

tester.run('report-module-load-effects in initialisers', reportModuleLoadEffects, {
  valid: [
    'export const schema = z.object({ a: z.string() });',
    'export const limit = Number("5"); const re = new RegExp("a"); const when = new Date(0);',
    'export const base = path.dirname(fileURLToPath(import.meta.url));',
    'export function now() { return Date.now(); }',
    'export const read = () => readFileSync("a");',
    'const handler = async () => { await fetch(url); };',
    'export const table = buildTableSync(rows);',
    'import { readFileSync } from "./local.js"; export const raw = readFileSync("a");',
  ],
  invalid: [
    {
      code: 'export const startedAt = Date.now();',
      errors: [{ messageId: 'importTimeEffect', data: { call: 'Date.now()' } }],
    },
    {
      code: 'import { readFileSync } from "node:fs"; export const raw = readFileSync("/etc/hostname", "utf8");',
      errors: [{ messageId: 'importTimeEffect', data: { call: 'readFileSync()' } }],
    },
    {
      code: 'export const response = await fetch(url);',
      errors: [{ messageId: 'topLevelAwait' }, { messageId: 'importTimeEffect' }],
    },
    {
      code: 'import * as fs from "fs"; export const files = fs.readdirSync(".");',
      errors: [{ messageId: 'importTimeEffect', data: { call: 'fs.readdirSync()' } }],
    },
    {
      code: 'export const timer = setInterval(tick, 1000);',
      errors: [{ messageId: 'importTimeEffect', data: { call: 'setInterval()' } }],
    },
    {
      code: 'export const registered = process.on("SIGINT", stop);',
      errors: [{ messageId: 'importTimeEffect', data: { call: 'process.on()' } }],
    },
    {
      code: 'const id = crypto.randomUUID(); const now = new Date(); const w = new Worker("a");',
      errors: [
        { messageId: 'importTimeEffect' },
        { messageId: 'importTimeEffect' },
        { messageId: 'importTimeEffect' },
      ],
    },
    { code: 'await main();', errors: [{ messageId: 'topLevelAwait' }] },
    { code: 'const value = await load();', errors: [{ messageId: 'topLevelAwait' }] },
  ],
});
