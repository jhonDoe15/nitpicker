import path from 'node:path';
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { literalText, narrowedTypes } from './field-narrowing.mts';
import { grammarFieldsOf, projectGrammarPackages, type GrammarFields } from './grammar-fields.mts';
import {
  grammarPackagesInSource,
  grammarPackagesInWasm,
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
    ...sources.flatMap((text) => grammarPackagesInSource(text)),
    ...literals.flatMap((text) => grammarPackagesInWasm(text)),
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

type Facts = {
  readonly sources: string[];
  readonly literals: string[];
  readonly lookups: Lookup[];
  usesTreeSitter: boolean;
};

type UnknownFieldContext = Readonly<TSESLint.RuleContext<'unknownField', []>>;

function recordModule(facts: Facts, node: TSESTree.Node): void {
  const source = sourceOf(node);
  if (source !== undefined) {
    facts.usesTreeSitter ||= isTreeSitterBinding(source);
    facts.sources.push(source);
  }
}

function recordText(facts: Facts, node: TSESTree.Node): void {
  const text = stringText(node);
  if (text !== undefined) {
    facts.literals.push(text);
  }
}

function recordLookup(facts: Facts, lookup: Lookup | undefined): void {
  if (lookup !== undefined) {
    facts.lookups.push(lookup);
  }
}

function grammarsOf(facts: Facts, directory: string): GrammarFields[] {
  return candidatePackages(facts.sources, facts.literals, directory).flatMap((name) => {
    const fields = grammarFieldsOf(directory, name);
    return fields === undefined ? [] : [fields];
  });
}

function reportUnknownFields(context: UnknownFieldContext, facts: Facts): void {
  if (!facts.usesTreeSitter || facts.lookups.length === 0) {
    return;
  }
  const directory = path.dirname(path.resolve(context.filename));
  const grammars = grammarsOf(facts, directory);
  if (grammars.length === 0) {
    return;
  }
  for (const lookup of facts.lookups) {
    const types = narrowedTypes(lookup.node, lookup.receiver, context.sourceCode);
    if (isUnknown(lookup, grammars, types)) {
      const where = types.length === 0 ? '' : ` on "${types.join('", "')}"`;
      context.report({
        node: lookup.node,
        messageId: 'unknownField',
        data: { field: lookup.field, where },
      });
    }
  }
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
    const facts: Facts = { sources: [], literals: [], lookups: [], usesTreeSitter: false };
    function visitModule(node: TSESTree.Node): void {
      recordModule(facts, node);
    }
    function visitText(node: TSESTree.Node): void {
      recordText(facts, node);
    }
    return {
      ImportDeclaration: visitModule,
      ImportExpression: visitModule,
      Literal: visitText,
      TemplateElement: visitText,
      CallExpression(node) {
        recordModule(facts, node);
        recordLookup(facts, fieldLookup(node));
      },
      BinaryExpression(node) {
        recordLookup(facts, cursorLookup(node));
      },
      'Program:exit'() {
        reportUnknownFields(context, facts);
      },
    };
  },
};
