import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { simplerForms as untypedSimplerForms } from '../../../../../../shared/logic/simplify/simpler-forms.mjs';
import {
  term as untypedTerm,
  withRange as untypedWithRange,
} from '../../../../../../shared/logic/terms.mjs';
import { isTermPart, toTerm, type Term } from '../analysis/logic/estree-terms.mts';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import { typeServices } from '../security/security-values.mts';
import { ancestorsOf, depthFirst, isNode, type SourceCode } from '../typed/node-views.mts';
import { ts } from '../typed/typescript-views.mts';
import { isTestOf } from './test-positions.mts';

type Range = readonly [number, number];
type Context = TSESLint.RuleContext<'simpler' | 'swapped', readonly unknown[]>;

const simplerForms: (
  root: Term,
  options: { readonly booleanContext: boolean },
) => readonly { readonly range: Range; readonly form: string; readonly swapped: boolean }[] =
  untypedSimplerForms;
const term: (kind: string, value: string | undefined, children: Term[]) => Term = untypedTerm;
const withRange: (node: Term, range: Range) => Term = untypedWithRange;

const HOLDS_BLOCKS = new Set<string>([
  'BlockStatement',
  'IfStatement',
  'Program',
  'TSModuleBlock',
  'StaticBlock',
  'SwitchCase',
]);
const BODY_OWNERS = new Set<string>([
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'LabeledStatement',
  'WithStatement',
]);
const LOOP_TESTS = new Set<string>(['WhileStatement', 'DoWhileStatement', 'ForStatement']);
const TYPE_PROBES = new Set<string>(['Identifier', 'MemberExpression', 'CallExpression']);
const TYPE_SYNTAX = new Set<string>([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
  'TSTypeParameterInstantiation',
]);

function childNodes(node: TSESTree.Node, visitorKeys: SourceCode['visitorKeys']): TSESTree.Node[] {
  return (visitorKeys[node.type] ?? [])
    .flatMap((field): unknown[] => {
      const child: unknown = Reflect.get(node, field) ?? [];
      return Array.isArray(child) ? child : [child];
    })
    .filter(isNode);
}

function typeSyntaxRanges(sourceCode: SourceCode): Range[] {
  const nodes = depthFirst<TSESTree.Node>(sourceCode.ast, (node) =>
    childNodes(node, sourceCode.visitorKeys),
  );
  return [...nodes].filter(({ type }) => TYPE_SYNTAX.has(type)).map(({ range }) => range);
}

function holdsAny(range: Range, inner: readonly Range[]): boolean {
  return inner.some(([start, end]) => start >= range[0] && end <= range[1]);
}

function booleanTypes(context: Context): (node: TSESTree.Node) => boolean {
  const services = typeServices(context);
  if (services === undefined) {
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

function ownList(node: TSESTree.Node): readonly TSESTree.Node[] | undefined {
  if (
    node.type === AST_NODE_TYPES.Program ||
    node.type === AST_NODE_TYPES.TSModuleBlock ||
    node.type === AST_NODE_TYPES.StaticBlock
  ) {
    return node.body;
  }
  return node.type === AST_NODE_TYPES.SwitchCase ? node.consequent : undefined;
}

function statementList(node: TSESTree.Node): readonly TSESTree.Node[] {
  const own = ownList(node);
  if (own !== undefined) {
    return own;
  }
  if (node.type === AST_NODE_TYPES.BlockStatement) {
    return HOLDS_BLOCKS.has(node.parent.type) ? [] : node.body;
  }
  const { parent } = node;
  return parent !== undefined &&
    BODY_OWNERS.has(parent.type) &&
    'body' in parent &&
    parent.body === node
    ? [node]
    : [];
}

function isInnerPart(node: TSESTree.Node | undefined): boolean {
  return node !== undefined && isTermPart(node) && !node.type.endsWith('Statement');
}

function expressionRoot(node: TSESTree.Node): TSESTree.Node | undefined {
  const chain = [node, ...ancestorsOf(node)];
  const root = chain.find((current) => !isInnerPart(current.parent));
  return root === undefined || (root.parent !== undefined && isTermPart(root.parent))
    ? undefined
    : root;
}

export const rule: TSESLint.RuleModule<'simpler' | 'swapped'> = {
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
    const options = { isBoolean: booleanTypes(context) };
    const seen = new WeakSet<TSESTree.Node>();
    const typeSyntax = typeSyntaxRanges(sourceCode);

    function report(root: Term, booleanContext: boolean): void {
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

    function checkStatements(node: TSESTree.Node): void {
      const statements = statementList(node);
      const first = statements[0];
      const last = statements.at(-1);
      if (first !== undefined && last !== undefined) {
        const children = statements.map((statement) => toTerm(statement, sourceCode, options));
        const range: Range = [first.range[0], last.range[1]];
        report(withRange(term('block', undefined, children), range), false);
      }
    }

    function checkExpression(node: TSESTree.Node): void {
      const root = expressionRoot(node);
      if (root !== undefined && !seen.has(root)) {
        seen.add(root);
        report(toTerm(root, sourceCode, options), isTestOf(root, LOOP_TESTS));
      }
    }

    return {
      'Program, StaticBlock, SwitchCase, TSModuleBlock, BlockStatement, :statement':
        checkStatements,
      'UnaryExpression[operator="!"], LogicalExpression, ConditionalExpression': checkExpression,
    };
  },
};
