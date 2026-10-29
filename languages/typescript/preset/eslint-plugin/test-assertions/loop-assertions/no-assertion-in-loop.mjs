import { isFunctionNode, resolveConstant } from '../../rules/analysis/constant-resolution.mjs';
import { testCallback } from '../../test-quality/test-calls.mjs';
import { fileBindings } from '../unowned-async/hosts.mjs';
import { nodesIn } from '../unowned-async/nodes.mjs';
import { isAssertionSite } from './assertion-sites.mjs';
import { loopsAround } from './loops.mjs';
import { subtestCallback } from './subtests.mjs';

const ALLOWED_FORMS =
  'Assert the whole collection at once (`expect(orders).toEqual([...])`, `assert.deepStrictEqual(orders, [...])`), put a table of cases in a parameterized test (`it.each`/`test.each`, or node:test subtests registered from the table), or use the loop only to build data before an unconditional assertion.';
const EXCEPTION_HINT =
  'An exception fits only when the loop cannot be replaced by one of these, for example cases generated at run time.';

function testBody(call) {
  return testCallback(call) ?? subtestCallback(call);
}

function isTestFunction(node) {
  return (
    isFunctionNode(node) && node.parent.type === 'CallExpression' && testBody(node.parent) === node
  );
}

function isLiteralTable(context, collection) {
  const table = collection === undefined ? undefined : resolveConstant(context, collection);
  return table?.type === 'ArrayExpression' && table.elements.length > 0;
}

function loopFindings(env, test) {
  const nodes = nodesIn(env.context, test.body, (child) => !isTestFunction(child));
  const sites = nodes
    .filter((node) => isAssertionSite(env, node))
    .map((site) => ({ site, loops: loopsAround(site, test) }))
    .filter(({ loops }) => loops.length > 0);
  return [...Map.groupBy(sites, ({ loops }) => loops.at(-1).node).values()].map((group) => ({
    site: group.map(({ site }) => site).toSorted((a, b) => a.range[0] - b.range[0])[0],
    loop: group[0].loops.at(-1),
  }));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban assertions inside loops and iterating callbacks in a test' },
    schema: [],
    messages: {
      loop: `This assertion runs once per element of a \`{{construct}}\`, so an empty collection makes the test pass without asserting anything. ${ALLOWED_FORMS} ${EXCEPTION_HINT}`,
      table: `This assertion runs once per row of a literal table in a \`{{construct}}\`: write the table as \`it.each([...])('name', (row) => { ... })\` (or \`test.each\`, or node:test subtests registered from the table), so each row is its own test and a table that comes up empty cannot pass unnoticed. To check one collection instead, assert it whole (\`expect(rows).toEqual([...])\`). ${EXCEPTION_HINT}`,
    },
  },
  create(context) {
    const env = { context, bindings: fileBindings(context.sourceCode.ast), helpers: new Map() };
    return {
      CallExpression(call) {
        const test = testBody(call);
        if (test === undefined) {
          return;
        }
        for (const { site, loop } of loopFindings(env, test)) {
          context.report({
            node: site,
            messageId: isLiteralTable(context, loop.collection) ? 'table' : 'loop',
            data: { construct: loop.name },
          });
        }
      },
    };
  },
};
