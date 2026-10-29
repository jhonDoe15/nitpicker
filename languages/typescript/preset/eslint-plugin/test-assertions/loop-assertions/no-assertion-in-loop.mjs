import { resolveConstant } from '../../rules/analysis/constant-resolution.mjs';
import { fileBindings } from '../unowned-async/hosts.mjs';
import { factsOf, siteKind } from './assertion-sites.mjs';
import { loopsAround } from './loops.mjs';
import { testBody } from './subtests.mjs';

const ALLOWED_FORMS =
  'Assert the whole collection at once (`expect(orders).toEqual([...])`, `assert.deepStrictEqual(orders, [...])`), put a table of cases in a parameterized test (`it.each`/`test.each`, or node:test subtests registered from a literal table), or use the loop only to build data before an unconditional assertion.';
const EXCEPTION_HINT =
  'An exception fits only when the loop cannot be replaced by one of these, for example cases generated at run time.';
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

function isLiteralTable(context, collection) {
  let table = collection === undefined ? undefined : resolveConstant(context, collection);
  while (WRAPPERS.has(table?.type)) {
    table = table.expression;
  }
  return table?.type === 'ArrayExpression' && table.elements.length > 0;
}

function loopsOf(env, fn, { site, kind }) {
  const loops = loopsAround(site, fn);
  return kind === 'subtest'
    ? loops.filter((loop) => !isLiteralTable(env.context, loop.collection))
    : loops;
}

function loopFindings(env, fn) {
  const sites = factsOf(env, fn)
    .nodes.map((node) => ({ site: node, kind: siteKind(env, node) }))
    .filter(({ kind }) => kind !== undefined)
    .map((found) => ({ ...found, loops: loopsOf(env, fn, found) }))
    .filter(({ loops }) => loops.length > 0);
  return [...Map.groupBy(sites, ({ loops }) => loops.at(-1).node).values()].map((group) => {
    const [first] = group.toSorted((a, b) => a.site.range[0] - b.site.range[0]);
    return { ...first, loop: first.loops.at(-1) };
  });
}

function reachableFindings(env, test) {
  const queued = new Set([test]);
  const pending = [test];
  const findings = [];
  for (const fn of pending) {
    if (env.analyzed.has(fn)) {
      continue;
    }
    env.analyzed.add(fn);
    findings.push(...loopFindings(env, fn));
    for (const callee of factsOf(env, fn).callees.filter((candidate) => !queued.has(candidate))) {
      queued.add(callee);
      pending.push(callee);
    }
  }
  return findings;
}

function messageFor(context, { kind, loop }) {
  if (kind === 'subtest') {
    return 'subtests';
  }
  return isLiteralTable(context, loop.collection) ? 'table' : 'loop';
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban assertions inside loops and iterating callbacks in a test' },
    schema: [
      {
        type: 'object',
        properties: { assertionFunctionNames: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      loop: `This assertion sits in a \`{{construct}}\` whose body can run zero times (an empty collection, or a condition that is false at the start), so the test can pass without asserting anything. ${ALLOWED_FORMS} ${EXCEPTION_HINT}`,
      table: `This assertion runs once per row of a literal table in a \`{{construct}}\`: in Vitest, Jest and Mocha write the table as \`it.each([...])('name', (row) => { ... })\` (or \`test.each\`), so each row is its own test and a table that comes up empty cannot pass unnoticed; in node:test register one subtest per row (\`for (const row of [...]) { await t.test(row.name, () => { ... }); }\`). To check one collection instead, assert it whole (\`expect(rows).toEqual([...])\`). ${EXCEPTION_HINT}`,
      subtests: `These node:test subtests are registered in a \`{{construct}}\` over a collection that can be empty, so no case may run and the test can pass without asserting anything. Register them from a literal, non-empty table (\`for (const row of [...]) { await t.test(row.name, () => { ... }); }\`, or a same-file const holding that array), or assert the whole collection at once. ${EXCEPTION_HINT}`,
    },
  },
  create(context) {
    const [options = {}] = context.options;
    const env = {
      context,
      bindings: fileBindings(context.sourceCode.ast, options.assertionFunctionNames),
      facts: new Map(),
      helpers: new Map(),
      analyzed: new Set(),
    };
    return {
      CallExpression(call) {
        const test = testBody(context, call);
        if (test === undefined) {
          return;
        }
        for (const finding of reachableFindings(env, test)) {
          context.report({
            node: finding.site,
            messageId: messageFor(context, finding),
            data: { construct: finding.loop.name },
          });
        }
      },
    };
  },
};
