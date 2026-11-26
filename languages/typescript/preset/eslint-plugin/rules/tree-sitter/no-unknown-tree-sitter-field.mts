import path from 'node:path';
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { operandsOf } from '../typed/syntax-views.mts';
import { nameOf } from '../typed/node-views.mts';
import { grammarFieldsOf, projectGrammarPackages, type GrammarFields } from './grammar-fields.mts';
import {
  grammarPackagesIn,
  isTreeSitterBinding,
  sourceOf,
  stringText,
} from './tree-sitter-module.mts';

const FIELD_CALLS = new Set(['childForFieldName', 'childrenForFieldName']);
const EQUALITY = new Set(['===', '==', '!==', '!=']);

type Lookup = {
  readonly node: TSESTree.Node;
  readonly field: string;
  readonly receiver?: TSESTree.Node;
};

function literalField(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return node === undefined ? undefined : stringText(node);
}

function fieldLookup(node: TSESTree.CallExpression): Lookup | undefined {
  const { callee } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    !FIELD_CALLS.has(nameOf(callee.property) ?? '')
  ) {
    return undefined;
  }
  const field = literalField(node.arguments[0]);
  return field === undefined ? undefined : { node, field, receiver: callee.object };
}

function cursorLookup(node: TSESTree.BinaryExpression): Lookup | undefined {
  if (!EQUALITY.has(node.operator)) {
    return undefined;
  }
  const [member, other] =
    node.left.type === AST_NODE_TYPES.MemberExpression
      ? [node.left, node.right]
      : [node.right, node.left];
  const field = literalField(other);
  return member.type === AST_NODE_TYPES.MemberExpression &&
    !member.computed &&
    nameOf(member.property) === 'currentFieldName' &&
    field !== undefined
    ? { node, field }
    : undefined;
}

function knownType(
  test: TSESTree.Node,
  receiverText: string,
  sourceCode: TSESLint.SourceCode,
): string | undefined {
  for (const operand of operandsOf(test, '&&')) {
    if (operand.type !== AST_NODE_TYPES.BinaryExpression || operand.operator !== '===') {
      continue;
    }
    const [member, other] =
      operand.left.type === AST_NODE_TYPES.MemberExpression
        ? [operand.left, operand.right]
        : [operand.right, operand.left];
    if (
      member.type === AST_NODE_TYPES.MemberExpression &&
      !member.computed &&
      nameOf(member.property) === 'type' &&
      sourceCode.getText(member.object) === receiverText
    ) {
      return literalField(other);
    }
  }
  return undefined;
}

function guardedType(lookup: Lookup, sourceCode: TSESLint.SourceCode): string | undefined {
  if (lookup.receiver === undefined) {
    return undefined;
  }
  const receiverText = sourceCode.getText(lookup.receiver);
  let child: TSESTree.Node = lookup.node;
  for (
    let parent = child.parent;
    parent && parent.type !== AST_NODE_TYPES.Program;
    child = parent, parent = parent.parent
  ) {
    const guarded =
      ((parent.type === AST_NODE_TYPES.IfStatement ||
        parent.type === AST_NODE_TYPES.ConditionalExpression) &&
        parent.consequent === child) ||
      (parent.type === AST_NODE_TYPES.LogicalExpression &&
        parent.operator === '&&' &&
        parent.right === child);
    const test = parent.type === AST_NODE_TYPES.LogicalExpression ? parent.left : undefined;
    const condition = guarded ? (test ?? ('test' in parent ? parent.test : undefined)) : undefined;
    const type =
      condition === undefined || condition === null
        ? undefined
        : knownType(condition, receiverText, sourceCode);
    if (type !== undefined) {
      return type;
    }
  }
  return undefined;
}

function candidatePackages(
  sources: readonly string[],
  literals: readonly string[],
  directory: string,
): string[] {
  const own = [
    ...sources.flatMap((text) => grammarPackagesIn(text, true)),
    ...literals.flatMap((text) => grammarPackagesIn(text, false)),
  ];
  return own.length > 0 ? own : projectGrammarPackages(directory);
}

function isUnknown(
  lookup: Lookup,
  grammars: readonly GrammarFields[],
  sourceCode: TSESLint.SourceCode,
): boolean {
  const type = guardedType(lookup, sourceCode);
  const typed = grammars.flatMap((grammar) => {
    const fields = type === undefined ? undefined : grammar.byType.get(type);
    return fields === undefined ? [] : [fields];
  });
  if (typed.length > 0) {
    return typed.every((fields) => !fields.has(lookup.field));
  }
  return grammars.every((grammar) => !grammar.all.has(lookup.field));
}

export const rule: TSESLint.RuleModule<'unknownField'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow tree-sitter field names that the grammar does not define',
    },
    schema: [],
    messages: {
      unknownField:
        'The grammar does not define a field "{{field}}"{{where}}, so this lookup always comes back empty and nothing fails. Check the field name against node-types.json of the grammar (the node type may have no fields at all, like a pattern without a name field), or read the child by position or type.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const sources: string[] = [];
    const literals: string[] = [];
    const lookups: Lookup[] = [];
    let usesTreeSitter = false;
    const visitModule = (node: TSESTree.Node): void => {
      const source = sourceOf(node);
      if (source !== undefined) {
        usesTreeSitter ||= isTreeSitterBinding(source);
        sources.push(source);
      }
    };
    return {
      ImportDeclaration: visitModule,
      ImportExpression: visitModule,
      Literal(node) {
        const text = stringText(node);
        if (text !== undefined) {
          literals.push(text);
        }
      },
      TemplateElement(node) {
        const text = stringText(node);
        if (text !== undefined) {
          literals.push(text);
        }
      },
      CallExpression(node) {
        visitModule(node);
        const lookup = fieldLookup(node);
        if (lookup !== undefined) {
          lookups.push(lookup);
        }
      },
      BinaryExpression(node) {
        const lookup = cursorLookup(node);
        if (lookup !== undefined) {
          lookups.push(lookup);
        }
      },
      'Program:exit'() {
        if (!usesTreeSitter || lookups.length === 0) {
          return;
        }
        const directory = path.dirname(path.resolve(context.filename));
        const grammars = candidatePackages(sources, literals, directory).flatMap((name) => {
          const fields = grammarFieldsOf(directory, name);
          return fields === undefined ? [] : [fields];
        });
        if (grammars.length === 0) {
          return;
        }
        for (const lookup of lookups) {
          if (isUnknown(lookup, grammars, sourceCode)) {
            const type = guardedType(lookup, sourceCode);
            context.report({
              node: lookup.node,
              messageId: 'unknownField',
              data: { field: lookup.field, where: type === undefined ? '' : ` on "${type}"` },
            });
          }
        }
      },
    };
  },
};
