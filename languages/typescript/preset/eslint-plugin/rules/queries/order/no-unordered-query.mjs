import { AGGREGATE_GAP } from '../../../../../../../shared/rules/queries/sql-order.mjs';
import { stringValue } from '../../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../../security/security-values.mjs';
import {
  chainSteps,
  isOpaque,
  isOrdered,
  isOutermostStep,
  isWrite,
  KYSELY,
  queryChain,
  queryScope,
} from '../query-chains.mjs';
import { sqlGaps } from '../query-texts.mjs';
import { unorderedOptionPages } from './query-options.mjs';

const PAGE_STEPS = new Set(['limit', 'offset', 'take', 'skip']);
const SELECTION_STEPS = new Set(['select', 'selectAll', 'addSelect', 'columns']);
const COUNT_STEPS = new Set(['count', 'countAll', 'countDistinct']);
const CONSTANT_SELECTION =
  /\b(?:count(?:All|Distinct)?|max|min|sum|avg)\s*\(|\.lit\s*\(|\bexists\s*\(|\bsql(?:<[^>]*>)?\s*`\s*1\s*`|^['"`]\s*1\s*(?:as\s+\w+)?['"`]$/u;
const AGGREGATE_NAMES = new Set(['array_agg', 'json_agg', 'jsonb_agg']);
const AGGREGATE_STEPS = new Set(['jsonAgg']);
const FORM_LENGTH = 40;
const EXCEPTION =
  'An exception fits only a query whose rows are known to come back in one order anyway, such as a primary-key lookup.';
const AGGREGATE_EXCEPTION =
  'An exception fits only a nested list that is a set, whose callers never depend on its order; add the path to "exceptions" with that reason.';

function stepForm(context, step) {
  const text = `${step.name}(${step.call.arguments.map((argument) => context.sourceCode.getText(argument)).join(', ')})`;
  return text.length > FORM_LENGTH || text.includes('\n') ? `${step.name}(...)` : text;
}

function isSingleRow(steps) {
  const pages = steps.filter((step) => PAGE_STEPS.has(step.name));
  const value = pages.length === 1 ? unwrapped(pages[0].call.arguments[0]) : undefined;
  return (
    ['limit', 'take'].includes(pages[0]?.name) && value?.type === 'Literal' && value.value === 1
  );
}

function isConstantSelection(context, steps) {
  const selections = steps.filter(
    (step) => SELECTION_STEPS.has(step.name) || COUNT_STEPS.has(step.name),
  );
  return (
    selections.length > 0 &&
    selections.every(
      (step) =>
        COUNT_STEPS.has(step.name) ||
        (step.call.arguments.length > 0 &&
          step.call.arguments.every((argument) =>
            CONSTANT_SELECTION.test(context.sourceCode.getText(argument)),
          )),
    )
  );
}

function unorderedPageStep(context, chain) {
  if (isWrite(chain) || isOpaque(chain) || isOrdered(chain)) {
    return undefined;
  }
  const page = chain.steps.find((step) => PAGE_STEPS.has(step.name));
  const existence = isSingleRow(chain.steps) && isConstantSelection(context, chain.steps);
  return page === undefined || existence ? undefined : page;
}

function insideExists(node) {
  const call = node.parent;
  const callee =
    call?.type === 'CallExpression' && call.arguments.includes(node)
      ? unwrapped(call.callee)
      : undefined;
  const name = callee?.type === 'MemberExpression' ? memberName(callee) : callee?.name;
  return name === 'exists' || name === 'notExists';
}

function isAggregateStep(step) {
  const first = stringValue(unwrapped(step.call.arguments[0]));
  return AGGREGATE_STEPS.has(step.name) || (step.name === 'agg' && AGGREGATE_NAMES.has(first));
}

function unorderedAggregateStep(steps) {
  const index = steps.findIndex((step) => isAggregateStep(step));
  const ordered = steps.slice(index + 1).some((step) => step.name === 'orderBy');
  return index === -1 || ordered ? undefined : steps[index];
}

function isJsonArrayFrom(scope, call) {
  const callee = unwrapped(call.callee);
  const binding = callee.type === 'Identifier' ? scope.bindings.get(callee.name) : undefined;
  return (
    binding?.source.startsWith('kysely/helpers/') === true && binding.imported === 'jsonArrayFrom'
  );
}

function unorderedSubquery(argument) {
  const { steps } = chainSteps(argument);
  const names = new Set(steps.map((step) => step.name));
  return names.has('selectFrom') && !isOrdered({ names }) && !isOpaque({ names });
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a page of rows (limit, offset, take, skip or a cursor) or an array_agg/json_agg list with no ORDER BY, whose order is undefined',
    },
    schema: [],
    messages: {
      page: `{{form}} picks a page of rows that has no ORDER BY, so which rows come back, and in which order, is up to the database and can change between runs. Order on a unique key before the page, or add a tie-breaker after a non-unique key: .orderBy('createdAt', 'desc').orderBy('id'). ${EXCEPTION}`,
      aggregate: `{{form}} builds a list with no ORDER BY, so its elements come back in whatever order the database reads them, and a test that compares the whole list can fail at random. Order inside the aggregate (json_agg(t ORDER BY t.name), eb.fn.jsonAgg('t').orderBy('t.name')) or give jsonArrayFrom a subquery with orderBy. ${AGGREGATE_EXCEPTION}`,
    },
  },
  create(context) {
    const scope = queryScope(context);
    const reported = new Set();

    function report(node, messageId, form) {
      const key = `${node.range}:${messageId}:${form}`;
      if (!reported.has(key)) {
        reported.add(key);
        context.report({ node, messageId, data: { form } });
      }
    }

    function checkChain(node) {
      const chain = insideExists(node) ? undefined : queryChain(scope, node);
      const page = chain === undefined ? undefined : unorderedPageStep(context, chain);
      if (page !== undefined) {
        report(page.call.callee.property, 'page', stepForm(context, page));
      }
      const aggregate = scope.libraries.has(KYSELY)
        ? unorderedAggregateStep(chainSteps(node).steps)
        : undefined;
      if (aggregate !== undefined) {
        report(aggregate.call.callee.property, 'aggregate', stepForm(context, aggregate));
      }
    }

    function checkText(node) {
      for (const gap of sqlGaps(context, node)) {
        report(node, gap.kind === AGGREGATE_GAP ? 'aggregate' : 'page', gap.form);
      }
    }

    return {
      CallExpression(node) {
        if (isJsonArrayFrom(scope, node) && unorderedSubquery(node.arguments[0])) {
          report(node, 'aggregate', 'jsonArrayFrom(...)');
        }
        for (const page of unorderedOptionPages(scope, node)) {
          report(page, 'page', context.sourceCode.getText(page).slice(0, FORM_LENGTH));
        }
        if (node.callee.type === 'MemberExpression' && isOutermostStep(node)) {
          checkChain(node);
        }
      },
      Literal: checkText,
      TemplateLiteral: checkText,
      TaggedTemplateExpression: checkText,
    };
  },
};
