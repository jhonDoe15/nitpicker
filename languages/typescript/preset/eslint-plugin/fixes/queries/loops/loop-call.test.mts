import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import { ormProject } from '../../../test-support/projects/orm-project.mts';
import { isInvariant } from './invariants.mts';
import { isInert } from './loop-effects.mts';
import { loopCall, resultDeclarator } from './loop-call.mts';
import { isReadOnlyResult } from './result-uses.mts';

const rule: TSESLint.RuleModule<'facts'> = {
  meta: { type: 'problem', schema: [], messages: { facts: '{{text}}' } },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(call) {
        if (call.callee.type !== AST_NODE_TYPES.Identifier || call.callee.name !== 'load') {
          return;
        }
        const { sourceCode } = context;
        const found = loopCall(context, call);
        const declarator = found === undefined ? undefined : resultDeclarator(found, call);
        const extra = call.arguments[1];
        const repeated = found === undefined ? undefined : { ...found, target: call };
        const invariant =
          extra === undefined || repeated === undefined
            ? '-'
            : String(isInvariant(sourceCode, extra, repeated));
        const parts =
          found === undefined
            ? ['none']
            : [
                found.loop === undefined ? 'callback' : 'for-of',
                sourceCode.getText(found.iterable),
                found.item.name,
                found.sequential ? 'sequential' : 'concurrent',
                `inert:${String(isInert(context, found, call))}`,
                `uses:${declarator === undefined ? '-' : String(isReadOnlyResult(context, declarator, 'row'))}`,
                `extra:${invariant}`,
              ];
        context.report({ node: call, messageId: 'facts', data: { text: parts.join(' ') } });
      },
    };
  },
};

const HEADER = [
  "import { Repository } from 'typeorm';",
  "import { User } from './entities';",
  'declare const repo: Repository<User>;',
  'declare const ids: string[];',
  'declare const pairs: [string, number][];',
  'declare const set: Set<string>;',
  'declare const holder: { ids: string[] };',
  'declare const scope: string;',
  'declare const out: unknown[];',
  'type Row = { name: string; tags: string[]; meta: { n: number } } | null;',
  'declare function load(id: string, extra?: unknown): Promise<Row>;',
  'declare function use(value: unknown): void;',
  'declare function pause(): Promise<void>;',
  'declare function key(): string;',
  '',
].join('\n');

const ITEMS = [
  HEADER,
  'type Item = { id: string; count: number; tags: string[]; owner: { id: string }; touch(): void };',
  'declare const items: Item[];',
  'declare function normalize(value: unknown): void;',
  '',
].join('\n');

const project = ormProject('loop-call');

function program(body: string, header = HEADER) {
  return `${header}export async function run() { ${body} }`;
}

function found(body: string, text: string, header = HEADER) {
  return {
    ...project.typed(program(body, header)),
    errors: [{ messageId: 'facts' as const, data: { text } }],
  };
}

const ITEM_SEQ = 'for-of items t sequential inert:true uses:true extra:-';
const ITEM_CALLBACK = 'callback items t concurrent inert:true uses:true extra:-';
const SEQ = 'for-of ids id sequential inert:true uses:true extra:-';
const CALLBACK = 'callback ids id concurrent inert:true uses:true extra:-';
const NONE = 'none';

project.tester.run('loopCall', rule, {
  valid: [],
  invalid: [
    found('for (const id of ids) { const u = await load(id); out.push(u); }', SEQ),
    found('for (const id of ids) { const u = await load(id); if (u) { out.push(u.name); } }', SEQ),
    found('for (const id of ids) { const u = await load(id); use(u?.meta.n); }', SEQ),
    found(
      'for (const id of ids) { const u = await load(id); const n = u?.tags.length; out.push(n); }',
      SEQ,
    ),
    found(
      'for (const id of holder.ids) { const u = await load(id); out.push(u); }',
      'for-of holder.ids id sequential inert:true uses:true extra:-',
    ),
    found('for (let id of ids) { const u = await load(id); out.push(u); }', SEQ),
    found(
      'for (const id of ids) { if (!scope) { continue; } const u = await load(id); out.push(u); }',
      SEQ,
    ),
    found(
      'for (const id of ids) { out.push(Number(id)); const u = await load(id); out.push(u); }',
      SEQ,
    ),
    found(
      'for (const id of ids) { const u = await load(id); for (const t of u?.tags ?? []) { if (t) { break; } } }',
      'for-of ids id sequential inert:true uses:true extra:-',
    ),
    found(
      'for (const id of ids) { const u = await load(id, scope); out.push(u); }',
      'for-of ids id sequential inert:true uses:true extra:true',
    ),
    found(
      'for (const id of ids) { const u = await load(id, { a: scope, b: holder.ids }); out.push(u); }',
      'for-of ids id sequential inert:true uses:true extra:true',
    ),
    found(
      'for (const id of ids) { const u = await load(id, id); out.push(u); }',
      'for-of ids id sequential inert:true uses:true extra:false',
    ),
    found(
      'for (const id of ids) { const u = await load(id, key()); out.push(u); }',
      'for-of ids id sequential inert:true uses:true extra:false',
    ),
    found(
      'let current = scope; for (const id of ids) { const u = await load(id, current); current = id; }',
      'for-of ids id sequential inert:true uses:true extra:false',
    ),
    found(
      'await Promise.all(ids.map(async (id) => { const u = await load(id); return u; }));',
      CALLBACK,
    ),
    found(
      'const rows = await Promise.all(ids.map(async (id) => { const u = await load(id); return u; }));',
      CALLBACK,
    ),
    found('ids.forEach(async (id) => { const u = await load(id); out.push(u); });', CALLBACK),
    found(
      'for (const id of ids) { const u = await load(id); u!.tags.push(id); }',
      'for-of ids id sequential inert:true uses:false extra:-',
    ),
    found(
      'for (const id of ids) { const u = await load(id); use(u); }',
      'for-of ids id sequential inert:true uses:false extra:-',
    ),
    found(
      'for (const id of ids) { const u = await load(id); Object.assign(u ?? {}, { a: 1 }); }',
      'for-of ids id sequential inert:true uses:false extra:-',
    ),
    found(
      'for (const id of ids) { const u = await load(id); if (u) { u.name = id; } }',
      'for-of ids id sequential inert:true uses:false extra:-',
    ),
    found(
      'for (const id of ids) { const u = await load(id); const f = () => u; use(f); }',
      'for-of ids id sequential inert:true uses:false extra:-',
    ),
    found(
      'for (const id of ids) { try { const u = await load(id); out.push(u); } catch { out.push(null); } }',
      'for-of ids id sequential inert:true uses:- extra:-',
    ),
    found(
      'for (const id of ids) { if (id) { const u = await load(id); out.push(u); } }',
      'for-of ids id sequential inert:true uses:- extra:-',
    ),
    found(
      'for (const id of ids) { const u = await load(id); await pause(); out.push(u); }',
      'for-of ids id sequential inert:false uses:true extra:-',
    ),
    found(
      'for (const id of ids) { const u = await load(id); void repo.update(1, { name: id }); }',
      'for-of ids id sequential inert:false uses:true extra:-',
    ),
    found(
      'for (const id of ids) { const u = await load(id); await repo.findOneBy({ id: 1 }); }',
      'for-of ids id sequential inert:false uses:true extra:-',
    ),
    found('for (const id of ids) { const u = await load(id); if (!u) { break; } }', NONE),
    found('for (const id of ids) { const u = await load(id); if (!u) { return; } }', NONE),
    found(
      'for (const id of ids) { const u = await load(id); if (!u) { throw new Error(id); } }',
      NONE,
    ),
    found('for (const id of ids) { const u = await load(id); ids.push(id); }', NONE),
    found('for (const id of ids) { const u = await load(id); id = id.trim(); }', NONE),
    found('for (const id of set) { const u = await load(id); out.push(u); }', NONE),
    found('for (const [id] of pairs) { const u = await load(id); out.push(u); }', NONE),
    found('for (const id of ids.slice(1)) { const u = await load(id); out.push(u); }', NONE),
    found('for await (const id of ids) { const u = await load(id); out.push(u); }', NONE),
    found('outer: for (const id of ids) { const u = await load(id); out.push(u); }', NONE),
    found('if (scope) for (const id of ids) { const u = await load(id); out.push(u); }', NONE),
    found('ids.forEach((id) => { void load(id); });', NONE),
    found(
      'await Promise.all(ids.map(async (id, index) => { const u = await load(id); return [u, index]; }));',
      NONE,
    ),
    found(
      'await Promise.all(ids.map(async function (id) { const u = await load(id); return u; }));',
      NONE,
    ),
    found(
      'await Promise.all(ids.map(async (id) => { await pause(); const u = await load(id); return u; }));',
      NONE,
    ),
    found(
      'const all = [await pause(), ...ids.map(async (id) => { const u = await load(id); return u; })];',
      NONE,
    ),
    ...[
      't.id = key();',
      't.id += key();',
      't.count++;',
      '--t.count;',
      'delete t.owner;',
      't.owner.id = key();',
      't.tags.push(key());',
      't.tags.sort();',
      't.touch();',
      'Object.assign(t, { count: 1 });',
      'normalize(t);',
      'normalize(t.owner);',
      'const alias = t; alias.id = key();',
      'const owner = t.owner; owner.id = key();',
      'const { id } = t; t.id = id + key();',
      '[t.id] = [key()];',
      '({ id: t.id } = { id: key() });',
    ].map((statement) =>
      found(
        `for (const t of items) { ${statement} const u = await load(t.id); out.push(u); }`,
        NONE,
        ITEMS,
      ),
    ),
    ...[
      't.id = key();',
      'normalize(t);',
      't.count++;',
      't.tags.push(key());',
      'Object.assign(t, { count: 1 });',
    ].map((statement) =>
      found(
        `for (const t of items) { const u = await load(t.id); ${statement} out.push(u); }`,
        NONE,
        ITEMS,
      ),
    ),
    found(
      'await Promise.all(items.map(async (t) => { t.id = key(); const u = await load(t.id); return u; }));',
      NONE,
      ITEMS,
    ),
    found(
      'await Promise.all(items.map(async (t) => { normalize(t); const u = await load(t.id); return u; }));',
      NONE,
      ITEMS,
    ),
    ...[
      'use(t.id);',
      'console.log(t);',
      'const label = String(t.count);',
      'const copy = { ...t };',
      'const id = t.id; use(id);',
      'const n = t.count + 1; use(n);',
      'const first = t.tags.slice(0, 1); use(first);',
      'out.push(t);',
      'const text = JSON.stringify(t); use(text);',
      'use(t.owner.id.toLowerCase());',
    ].map((statement) =>
      found(
        `for (const t of items) { ${statement} const u = await load(t.id); out.push(u); }`,
        ITEM_SEQ,
        ITEMS,
      ),
    ),
    found(
      'await Promise.all(items.map(async (t) => { use(t.id); const u = await load(t.id); return u; }));',
      ITEM_CALLBACK,
      ITEMS,
    ),
    found('for (const id of ids) { use(id); const u = await load(id); out.push(u); }', SEQ),
    found('for (const id of holder.ids) { use(id); const u = await load(id); out.push(u); }', NONE),
    found('for (const id of holder.ids) { const u = await load(id); use(u); }', NONE),
    found(
      'for (const id of holder.ids) { const u = await load(id); console.log(u); }',
      'for-of holder.ids id sequential inert:true uses:true extra:-',
    ),
    found(
      'for (const id of holder.ids) { const u = await load(id); out.push(u?.name.trim()); }',
      'for-of holder.ids id sequential inert:true uses:true extra:-',
    ),
  ],
});
