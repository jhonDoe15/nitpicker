import { simplerForms } from '../../../../../../shared/logic/simplify/simpler-forms.mjs';
import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { term, withRange } from '../../../../../../shared/logic/terms.mjs';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';
import { isTermPart, toTerm } from '../analysis/logic/estree-terms.mjs';
import { partsOf } from '../analysis/narrowing/type-parts.mjs';

const LISTS = new Map([
  ['Program', 'body'],
  ['TSModuleBlock', 'body'],
  ['StaticBlock', 'body'],
  ['SwitchCase', 'consequent'],
]);
const HOLDS_BLOCKS = new Set(['BlockStatement', 'IfStatement', ...LISTS.keys()]);
const BODY_OWNERS = new Set([
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'LabeledStatement',
  'WithStatement',
]);
const LOOP_TESTS = new Set(['WhileStatement', 'DoWhileStatement', 'ForStatement']);
const TYPE_PROBES = new Set(['Identifier', 'MemberExpression', 'CallExpression']);
const TYPE_SYNTAX = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
  'TSTypeParameterInstantiation',
]);

function childNodes(node, visitorKeys) {
  return (visitorKeys[node.type] ?? [])
    .flatMap((field) => node[field] ?? [])
    .filter((child) => typeof child?.type === 'string');
}

function typeSyntaxRanges(sourceCode) {
  const nodes = depthFirst(sourceCode.ast, (node) => childNodes(node, sourceCode.visitorKeys));
  return [...nodes].filter(({ type }) => TYPE_SYNTAX.has(type)).map(({ range }) => range);
}

function holdsAny(range, inner) {
  return inner.some(([start, end]) => start >= range[0] && end <= range[1]);
}

function booleanTypes(services) {
  if (services?.program === null || services?.program === undefined) {
    return () => false;
  }
  return (node) => {
    if (!TYPE_PROBES.has(node.type)) {
      return false;
    }
    const parts = partsOf(services.getTypeAtLocation(node));
    return parts.every((part) => (part.flags & ts.TypeFlags.BooleanLike) !== 0);
  };
}

function statementList(node) {
  if (LISTS.has(node.type)) {
    return node[LISTS.get(node.type)];
  }
  if (node.type === 'BlockStatement') {
    return HOLDS_BLOCKS.has(node.parent.type) ? [] : node.body;
  }
  return BODY_OWNERS.has(node.parent.type) && node.parent.body === node ? [node] : [];
}

function isInnerPart(node) {
  return isTermPart(node) && !node.type.endsWith('Statement');
}

function expressionRoot(node) {
  const chain = [node, ...ancestorsOf(node)];
  const index = chain.findIndex((current) => !isInnerPart(current.parent));
  const root = chain[index];
  return isTermPart(root.parent) ? undefined : root;
}

function isLoopTest(node) {
  return LOOP_TESTS.has(node.parent.type) && node.parent.test === node;
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Report boolean logic that has a strictly simpler exact form, and print that form',
    },
    schema: [],
    messages: {
      simpler: 'Write this boolean logic in its simpler exact form: `{{ form }}`.',
      swapped:
        'Write this boolean logic in its simpler exact form: `{{ form }}`, with the two branches swapped.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const options = { isBoolean: booleanTypes(sourceCode.parserServices) };
    const seen = new WeakSet();
    const typeSyntax = typeSyntaxRanges(sourceCode);

    function report(root, booleanContext) {
      const forms = simplerForms(root, { booleanContext });
      for (const { range, form, swapped } of forms.filter(
        (found) => !holdsAny(found.range, typeSyntax),
      )) {
        context.report({
          loc: {
            start: sourceCode.getLocFromIndex(range[0]),
            end: sourceCode.getLocFromIndex(range[1]),
          },
          messageId: swapped ? 'swapped' : 'simpler',
          data: { form },
        });
      }
    }

    function checkStatements(node) {
      const statements = statementList(node);
      if (statements.length > 0) {
        const children = statements.map((statement) => toTerm(statement, sourceCode, options));
        const range = [statements[0].range[0], statements.at(-1).range[1]];
        report(withRange(term('block', undefined, children), range), false);
      }
    }

    function checkExpression(node) {
      const root = expressionRoot(node);
      if (root !== undefined && !seen.has(root)) {
        seen.add(root);
        report(toTerm(root, sourceCode, options), isLoopTest(root));
      }
    }

    return {
      'Program, StaticBlock, SwitchCase, TSModuleBlock, BlockStatement, :statement':
        checkStatements,
      'UnaryExpression[operator="!"], LogicalExpression, ConditionalExpression': checkExpression,
    };
  },
};
