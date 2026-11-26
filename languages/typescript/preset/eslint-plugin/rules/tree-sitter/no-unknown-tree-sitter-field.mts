import path from 'node:path';
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { literalText, narrowedTypes } from './field-narrowing.mts';
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

function fieldLookup(node: TSESTree.CallExpression): Lookup | undefined {
  const { callee } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    !FIELD_CALLS.has(nameOf(callee.property) ?? '')
  ) {
    return undefined;
  }
  const field = literalText(node.arguments[0]);
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
  const field = literalText(other);
  return member.type === AST_NODE_TYPES.MemberExpression &&
    !member.computed &&
    nameOf(member.property) === 'currentFieldName' &&
    field !== undefined
    ? { node, field, receiver: member.object }
    : undefined;
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

function narrowedFields(grammar: GrammarFields, types: readonly string[]): Set<string> | undefined {
  const sets = types.map((type) => grammar.byType.get(type));
  if (sets.length === 0 || sets.some((fields) => fields === undefined)) {
    return undefined;
  }
  return new Set(sets.flatMap((fields) => [...(fields ?? [])]));
}

function isUnknown(
  lookup: Lookup,
  grammars: readonly GrammarFields[],
  types: readonly string[],
): boolean {
  const typed = grammars.flatMap((grammar) => {
    const fields = narrowedFields(grammar, types);
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
          const types = narrowedTypes(lookup.node, lookup.receiver, sourceCode);
          if (isUnknown(lookup, grammars, types)) {
            context.report({
              node: lookup.node,
              messageId: 'unknownField',
              data: {
                field: lookup.field,
                where: types.length === 0 ? '' : ` on "${types.join('", "')}"`,
              },
            });
          }
        }
      },
    };
  },
};
