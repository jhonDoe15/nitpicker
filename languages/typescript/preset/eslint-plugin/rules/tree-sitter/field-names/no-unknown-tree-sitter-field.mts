import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { nameOf } from '../../typed/node-views.mts';
import { calleeNameOf, unwrapped } from '../../typed/syntax-views.mts';
import {
  resolveActiveGrammar,
  type FieldRuleOption,
  type GrammarFieldTable,
} from './grammar-fields.mts';
import { narrowedNodeTypes, receiverKeyOf } from './type-narrowing.mts';

type MessageId = 'unknownField' | 'unknownFieldForNodeType';
type Options = readonly [FieldRuleOption?];
type RuleContext = Readonly<TSESLint.RuleContext<MessageId, Options>>;
type FieldCheck = {
  readonly reportNode: TSESTree.Node;
  readonly field: string;
  readonly narrowed: readonly string[] | undefined;
};

const FIELD_METHODS = new Set(['childForFieldName', 'childrenForFieldName']);
const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);

const UNKNOWN_FIELD_MESSAGE =
  'Tree-sitter field "{{field}}" is not defined by any node type in the active grammar. ' +
  "Check the grammar's `node-types.json` for valid field names.";

const UNKNOWN_FIELD_FOR_NODE_TYPE_MESSAGE =
  'Tree-sitter node type "{{nodeType}}" does not define field "{{field}}" in the active grammar. ' +
  "Check the grammar's `node-types.json` or inspect its named children instead.";

function isFieldNameExpression(node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  if (plain.type === AST_NODE_TYPES.Identifier) {
    return plain.name === 'fieldName';
  }
  return (
    plain.type === AST_NODE_TYPES.MemberExpression &&
    !plain.computed &&
    nameOf(plain.property) === 'currentFieldName'
  );
}

function comparedFieldLiteral(node: TSESTree.BinaryExpression): TSESTree.Node | undefined {
  if (!EQUALITY_OPERATORS.has(node.operator)) {
    return undefined;
  }
  if (isFieldNameExpression(node.left)) {
    return node.right;
  }
  return isFieldNameExpression(node.right) ? node.left : undefined;
}

function isValidForNodeType(grammar: GrammarFieldTable, nodeType: string, field: string): boolean {
  const typeFields = grammar.fieldsByNodeType.get(nodeType);
  return typeFields === undefined ? grammar.allFields.has(field) : typeFields.has(field);
}

function reportFieldCheck(
  context: RuleContext,
  grammar: GrammarFieldTable,
  check: FieldCheck,
): void {
  const { reportNode, field, narrowed } = check;
  if (!grammar.allFields.has(field)) {
    context.report({ node: reportNode, messageId: 'unknownField', data: { field } });
    return;
  }
  if (
    narrowed !== undefined &&
    !narrowed.some((nodeType) => isValidForNodeType(grammar, nodeType, field))
  ) {
    context.report({
      node: reportNode,
      messageId: 'unknownFieldForNodeType',
      data: { field, nodeType: narrowed.join(' | ') },
    });
  }
}

function checkFieldCall(
  context: RuleContext,
  grammar: GrammarFieldTable,
  node: TSESTree.CallExpression,
): void {
  const callee = unwrapped(node.callee);
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    !FIELD_METHODS.has(calleeNameOf(callee) ?? '')
  ) {
    return;
  }
  const [first] = node.arguments;
  if (first === undefined || first.type === AST_NODE_TYPES.SpreadElement) {
    return;
  }
  const field = stringValue(unwrapped(first));
  if (field === undefined) {
    return;
  }
  const receiverKey = receiverKeyOf(callee.object);
  const narrowed = receiverKey === undefined ? undefined : narrowedNodeTypes(node, receiverKey);
  reportFieldCheck(context, grammar, { reportNode: first, field, narrowed });
}

function checkFieldLiteral(
  context: RuleContext,
  grammar: GrammarFieldTable,
  literalNode: TSESTree.Node,
): void {
  const field = stringValue(unwrapped(literalNode));
  if (field !== undefined && !grammar.allFields.has(field)) {
    context.report({ node: literalNode, messageId: 'unknownField', data: { field } });
  }
}

export const rule: TSESLint.RuleModule<MessageId, Options> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow referencing tree-sitter field names not defined by the active grammar',
    },
    schema: [
      {
        type: 'object',
        properties: {
          grammarFields: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          nodeTypesPath: {
            type: 'string',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unknownField: UNKNOWN_FIELD_MESSAGE,
      unknownFieldForNodeType: UNKNOWN_FIELD_FOR_NODE_TYPE_MESSAGE,
    },
  },
  create(context) {
    const grammar = resolveActiveGrammar(
      context.sourceCode.ast,
      context.options[0],
      context.filename,
    );
    if (grammar === undefined) {
      return {};
    }
    return {
      CallExpression(node: TSESTree.CallExpression) {
        checkFieldCall(context, grammar, node);
      },
      BinaryExpression(node: TSESTree.BinaryExpression) {
        const literal = comparedFieldLiteral(node);
        if (literal !== undefined) {
          checkFieldLiteral(context, grammar, literal);
        }
      },
      SwitchCase(node: TSESTree.SwitchCase) {
        if (node.test !== null && isFieldNameExpression(node.parent.discriminant)) {
          checkFieldLiteral(context, grammar, node.test);
        }
      },
    };
  },
};
