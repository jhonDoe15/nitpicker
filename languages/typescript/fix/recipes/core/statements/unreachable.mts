import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { inside } from '../../../../preset/eslint-plugin/rules/decided/syntax.mts';
import { coreRuleRecipe, type CorePlan, type CoreRequest } from '../core-rule-recipe.mts';
import { hasComment, withOwnLines, type Range } from '../text-ranges.mts';

const KEPT_OUT = new Set<string>([
  AST_NODE_TYPES.ImportDeclaration,
  AST_NODE_TYPES.ExportNamedDeclaration,
  AST_NODE_TYPES.ExportDefaultDeclaration,
  AST_NODE_TYPES.ExportAllDeclaration,
  AST_NODE_TYPES.PropertyDefinition,
]);

type Declaring =
  TSESTree.VariableDeclarator | TSESTree.ClassDeclaration | TSESTree.FunctionDeclaration;

function within(node: TSESTree.Node | undefined, { start, end }: Range): boolean {
  return node !== undefined && node.range[0] >= start && node.range[1] <= end;
}

function listOf(node: TSESTree.Node): readonly TSESTree.Node[] {
  switch (node.type) {
    case AST_NODE_TYPES.Program:
    case AST_NODE_TYPES.BlockStatement:
    case AST_NODE_TYPES.StaticBlock: {
      return node.body;
    }
    case AST_NODE_TYPES.SwitchCase: {
      return node.consequent;
    }
    default: {
      return [node];
    }
  }
}

function isDeclaring(node: TSESTree.Node): node is Declaring {
  return (
    node.type === AST_NODE_TYPES.VariableDeclarator ||
    node.type === AST_NODE_TYPES.ClassDeclaration ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

function isVar(node: Declaring): boolean {
  return node.type === AST_NODE_TYPES.VariableDeclarator && node.parent.kind === 'var';
}

function hoistedNames(declarations: readonly Declaring[]): string[] | undefined {
  const names = declarations
    .filter(isVar)
    .map((declarator) =>
      'id' in declarator && declarator.id?.type === AST_NODE_TYPES.Identifier
        ? declarator.id.name
        : undefined,
    );
  return names.includes(undefined)
    ? undefined
    : [...new Set(names.filter((name) => name !== undefined))];
}

function usedFromReachable(
  { sourceCode }: CoreRequest,
  declarations: readonly Declaring[],
  range: Range,
): boolean {
  return declarations
    .filter((declaration) => !isVar(declaration))
    .flatMap((declaration) => sourceCode.getDeclaredVariables(declaration))
    .some(({ references }) => references.some(({ identifier }) => !within(identifier, range)));
}

function deleted(request: CoreRequest): CorePlan {
  const { text, sourceCode, node, range } = request;
  const statements = listOf(node).filter((statement) => within(statement, range));
  if (statements.length === 0 || statements.some(({ type }) => KEPT_OUT.has(type))) {
    return { declined: 'the unreachable code holds an import, an export or a class field' };
  }
  const declarations = statements
    .flatMap((statement) => [...inside(statement)])
    .filter(isDeclaring);
  const hoisted = hoistedNames(declarations);
  if (hoisted === undefined || usedFromReachable(request, declarations, range)) {
    return { declined: 'a declaration in it is a pattern or is used from reachable code' };
  }
  if (hasComment(sourceCode, range)) {
    return { declined: 'the unreachable code holds a comment' };
  }
  const kept = hoisted.length === 0 ? '' : `var ${hoisted.join(', ')};`;
  const lines = withOwnLines(text, range);
  const whole = lines.start !== range.start || lines.end !== range.end;
  const indent = text.slice(lines.start, range.start);
  return { edits: [{ ...lines, text: whole && kept !== '' ? `${indent}${kept}\n` : kept }] };
}

export const unreachableRecipe = coreRuleRecipe({
  id: 'typescript-no-unreachable',
  rule: 'no-unreachable',
  presets: ['javascript'],
  plan: deleted,
});
