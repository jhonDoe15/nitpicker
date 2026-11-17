import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../../rules/analysis/constant-resolution.mts';
import { chainOf } from '../../rules/typed/node-views.mts';
import { fileBindings } from '../unowned-async/hosts.mts';
import type { FunctionNode } from '../unowned-async/nodes.mts';
import { factsOf, siteKind, type LoopEnv } from './assertion-sites.mts';
import { loopsAround, type Construct } from './loops.mts';
import { testBody } from './subtests.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type Options = readonly [{ readonly assertionFunctionNames?: readonly string[] }?];
type SiteKind = NonNullable<ReturnType<typeof siteKind>>;
type Finding = {
  readonly site: TSESTree.Node;
  readonly kind: SiteKind;
  readonly loops: readonly Construct[];
  readonly loop: Construct;
};
type Wrapper =
  TSESTree.TSAsExpression | TSESTree.TSSatisfiesExpression | TSESTree.TSNonNullExpression;

const ALLOWED_FORMS =
  'Assert the whole collection at once (`expect(orders).toEqual([...])`, `assert.deepStrictEqual(orders, [...])`), put a table of cases in a parameterized test (`it.each`/`test.each`, or node:test subtests registered from a literal table), or use the loop only to build data before an unconditional assertion.';
const EXCEPTION_HINT =
  'An exception fits only when the loop cannot be replaced by one of these, for example cases generated at run time.';
function isWrapper(node: TSESTree.Node): node is Wrapper {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
  );
}

function isLiteralTable(context: SourceContext, collection: TSESTree.Node | undefined): boolean {
  const resolved = collection === undefined ? undefined : resolveConstant(context, collection);
  const table = chainOf(resolved, (node) => (isWrapper(node) ? node.expression : undefined)).at(-1);
  return table?.type === AST_NODE_TYPES.ArrayExpression && table.elements.length > 0;
}

function loopsOf(
  env: LoopEnv,
  fn: FunctionNode,
  { site, kind }: { site: TSESTree.Node; kind: SiteKind },
): readonly Construct[] {
  const loops = loopsAround(site, fn);
  return kind === 'subtest'
    ? loops.filter((loop) => !isLiteralTable(env.context, loop.collection))
    : loops;
}

function loopFindings(env: LoopEnv, fn: FunctionNode): Finding[] {
  const sites = factsOf(env, fn)
    .nodes.flatMap((node) => {
      const kind = siteKind(env, node);
      return kind === undefined ? [] : [{ site: node, kind }];
    })
    .map((found) => ({ ...found, loops: loopsOf(env, fn, found) }))
    .filter(({ loops }) => loops.length > 0);
  return [...Map.groupBy(sites, ({ loops }) => loops.at(-1)?.node).values()].flatMap((group) => {
    const first = group.reduce((best, each) =>
      each.site.range[0] < best.site.range[0] ? each : best,
    );
    const loop = first.loops.at(-1);
    return loop === undefined ? [] : [{ ...first, loop }];
  });
}

function reachableFindings(env: LoopEnv, test: FunctionNode): Finding[] {
  const queued = new Set([test]);
  const pending = [test];
  const findings: Finding[] = [];
  for (const fn of pending) {
    if (env.analyzed.has(fn)) {
      continue;
    }
    env.analyzed.add(fn);
    appendAll(findings, loopFindings(env, fn));
    for (const callee of factsOf(env, fn).callees.filter((candidate) => !queued.has(candidate))) {
      queued.add(callee);
      pending.push(callee);
    }
  }
  return findings;
}

function messageFor(
  context: SourceContext,
  { kind, loop }: Finding,
): 'subtests' | 'table' | 'loop' {
  if (kind === 'subtest') {
    return 'subtests';
  }
  return isLiteralTable(context, loop.collection) ? 'table' : 'loop';
}

export const rule: TSESLint.RuleModule<'loop' | 'table' | 'subtests', Options> = {
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
    const env: LoopEnv = {
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
