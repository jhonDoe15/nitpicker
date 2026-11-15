import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { AGGREGATE_GAP } from '../../../../../../../shared/rules/queries/sql-order.mjs';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../../security/security-values.mts';
import { nameOf } from '../../typed/node-views.mts';
import {
  chainSteps,
  isOpaque,
  isOrdered,
  isOutermostStep,
  isWrite,
  queryChain,
  queryScope,
  type QueryChain,
  type Step,
} from '../query-chains.mts';
import { KYSELY, type ChainScope } from '../chains/chain-libraries.mts';
import { sqlGaps } from '../query-texts.mts';
import { unorderedOptionPages } from './query-options.mts';

const AGGREGATE = 'aggregate';
const PAGE_STEPS = new Set<string | undefined>(['limit', 'offset', 'take', 'skip']);
const SELECTION_STEPS = new Set<string | undefined>([
  'select',
  'selectAll',
  'addSelect',
  'columns',
]);
const COUNT_STEPS = new Set<string | undefined>(['count', 'countAll', 'countDistinct']);
const CONSTANT_SELECTION =
  /\b(?:count(?:All|Distinct)?|max|min|sum|avg)\s*\(|\.lit\s*\(|\bexists\s*\(|\bsql(?:<[^>]*>)?\s*`\s*1\s*`|^['"`]\s*1\s*(?:as\s+\w+)?['"`]$/u;
const SINGLE_ROW_STEPS: readonly (string | undefined)[] = ['limit', 'take'];
const AGGREGATE_NAMES = new Set<string | undefined>(['array_agg', 'json_agg', 'jsonb_agg']);
const AGGREGATE_STEPS = new Set<string | undefined>(['jsonAgg']);
const FORM_LENGTH = 40;
const EXCEPTION =
  'An exception fits only a query whose rows are known to come back in one order anyway, such as a primary-key lookup.';
const AGGREGATE_EXCEPTION =
  'An exception fits only a nested list that is a set, whose callers never depend on its order; add the path to "exceptions" with that reason.';

function stepForm(context: Context, step: Step): string {
  const name = String(step.name);
  const text = `${name}(${step.call.arguments.map((argument) => context.sourceCode.getText(argument)).join(', ')})`;
  return text.length > FORM_LENGTH || text.includes('\n') ? `${name}(...)` : text;
}

function isSingleRow(steps: Step[]): boolean {
  const pages = steps.filter((step) => PAGE_STEPS.has(step.name));
  const [first] = pages;
  const value =
    pages.length === 1 && first !== undefined ? unwrapped(first.call.arguments[0]) : undefined;
  return (
    SINGLE_ROW_STEPS.includes(first?.name) &&
    value?.type === AST_NODE_TYPES.Literal &&
    value.value === 1
  );
}

function isConstantSelection(context: Context, steps: Step[]): boolean {
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

function unorderedPageStep(context: Context, chain: QueryChain): Step | undefined {
  if (isWrite(chain) || isOpaque(chain) || isOrdered(chain)) {
    return undefined;
  }
  const page = chain.steps.find((step) => PAGE_STEPS.has(step.name));
  const existence = isSingleRow(chain.steps) && isConstantSelection(context, chain.steps);
  return page === undefined || existence ? undefined : page;
}

function insideExists(node: TSESTree.Node): boolean {
  const call = node.parent;
  const callee =
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.some((argument) => argument === node)
      ? unwrapped(call.callee)
      : undefined;
  const name =
    callee?.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : nameOf(callee);
  return name === 'exists' || name === 'notExists';
}

function isAggregateStep(step: Step): boolean {
  const first = stringValue(unwrapped(step.call.arguments[0]));
  return AGGREGATE_STEPS.has(step.name) || (step.name === 'agg' && AGGREGATE_NAMES.has(first));
}

function unorderedAggregateStep(steps: Step[]): Step | undefined {
  const index = steps.findIndex((step) => isAggregateStep(step));
  const ordered = steps.slice(index + 1).some((step) => step.name === 'orderBy');
  return index === -1 || ordered ? undefined : steps[index];
}

function isJsonArrayFrom(scope: ChainScope, call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  const binding =
    callee.type === AST_NODE_TYPES.Identifier ? scope.bindings.get(callee.name) : undefined;
  return (
    binding?.source.startsWith('kysely/helpers/') === true && binding.imported === 'jsonArrayFrom'
  );
}

function unorderedSubquery(argument: TSESTree.Node | undefined): boolean {
  if (argument === undefined) {
    return false;
  }
  const { steps } = chainSteps(argument);
  const names = new Set(steps.map((step) => step.name));
  return names.has('selectFrom') && !isOrdered({ names }) && !isOpaque({ names });
}

export const rule: TSESLint.RuleModule<'page' | typeof AGGREGATE, readonly []> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a page of rows (limit, offset, take, skip or a cursor) or an array_agg/json_agg list with no ORDER BY, whose order is undefined',
    },
    schema: [],
    messages: {
      page: `{{form}} picks a page of rows that has no ORDER BY, so which rows come back, and in which order, is up to the database and can change between runs. Order on a unique key before the page, or add a tie-breaker after a non-unique key: .orderBy('createdAt', 'desc').orderBy('id'). ${EXCEPTION}`,
      [AGGREGATE]: `{{form}} builds a list with no ORDER BY, so its elements come back in whatever order the database reads them, and a test that compares the whole list can fail at random. Order inside the aggregate (json_agg(t ORDER BY t.name), eb.fn.jsonAgg('t').orderBy('t.name')) or give jsonArrayFrom a subquery with orderBy. ${AGGREGATE_EXCEPTION}`,
    },
  },
  create(context) {
    const scope = queryScope(context);
    const reported = new Set<string>();

    function report(node: TSESTree.Node, messageId: 'page' | typeof AGGREGATE, form: string): void {
      const key = `${node.range.join()}:${messageId}:${form}`;
      if (!reported.has(key)) {
        reported.add(key);
        context.report({ node, messageId, data: { form } });
      }
    }

    function reportStep(step: Step, messageId: 'page' | typeof AGGREGATE): void {
      const { callee } = step.call;
      if (callee.type === AST_NODE_TYPES.MemberExpression) {
        report(callee.property, messageId, stepForm(context, step));
      }
    }

    function checkChain(node: TSESTree.CallExpression): void {
      const chain = insideExists(node) ? undefined : queryChain(scope, node);
      const page = chain === undefined ? undefined : unorderedPageStep(context, chain);
      if (page !== undefined) {
        reportStep(page, 'page');
      }
      const aggregate = scope.libraries.has(KYSELY)
        ? unorderedAggregateStep(chainSteps(node).steps)
        : undefined;
      if (aggregate !== undefined) {
        reportStep(aggregate, AGGREGATE);
      }
    }

    function checkText(node: TSESTree.Node): void {
      for (const gap of sqlGaps(context, node)) {
        report(node, gap.kind === AGGREGATE_GAP ? AGGREGATE : 'page', gap.form);
      }
    }

    return {
      CallExpression(node) {
        if (isJsonArrayFrom(scope, node) && unorderedSubquery(node.arguments[0])) {
          report(node, AGGREGATE, 'jsonArrayFrom(...)');
        }
        for (const page of unorderedOptionPages(scope, node)) {
          report(page, 'page', context.sourceCode.getText(page).slice(0, FORM_LENGTH));
        }
        if (node.callee.type === AST_NODE_TYPES.MemberExpression && isOutermostStep(node)) {
          checkChain(node);
        }
      },
      Literal: checkText,
      TemplateLiteral: checkText,
      TaggedTemplateExpression: checkText,
    };
  },
};
