import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { hasCommentIn, inserting, replacing, type FixPlan } from './ranges.mts';

const SPACES_AFTER = /^[ \t]*/u;

export function keyName(property: TSESTree.ObjectLiteralElement): string | undefined {
  if (property.type !== AST_NODE_TYPES.Property || property.computed) {
    return undefined;
  }
  return property.key.type === AST_NODE_TYPES.Identifier
    ? property.key.name
    : String(property.key.value);
}

export function isPlainObject(
  node: TSESTree.Node | undefined,
  { allowSpread }: Readonly<Record<string, unknown>> = {},
): node is TSESTree.ObjectExpression {
  return (
    node?.type === AST_NODE_TYPES.ObjectExpression &&
    node.properties.every((property) =>
      property.type === AST_NODE_TYPES.SpreadElement
        ? allowSpread === true
        : !property.computed && property.kind === 'init',
    )
  );
}

export function addingProperty(
  sourceCode: SourceCode,
  object: TSESTree.ObjectExpression,
  text: string,
): FixPlan | undefined {
  const last = object.properties.at(-1);
  if (last !== undefined) {
    return inserting(last.range[1], `, ${text}`);
  }
  return hasCommentIn(sourceCode, object.range)
    ? undefined
    : replacing(object.range, `{ ${text} }`);
}

export function removingProperty(
  sourceCode: SourceCode,
  property: TSESTree.ObjectLiteralElement,
): FixPlan | undefined {
  const next = sourceCode.getTokenAfter(property);
  const previous = sourceCode.getTokenBefore(property);
  let range: TSESTree.Range = property.range;
  if (next?.value === ',') {
    const spaces = (SPACES_AFTER.exec(sourceCode.text.slice(next.range[1]))?.[0] ?? '').length;
    range = [property.range[0], next.range[1] + spaces];
  } else if (previous?.value === ',') {
    range = [previous.range[0], property.range[1]];
  } else if (previous?.value === '{' && next?.value === '}') {
    range = [previous.range[1], next.range[0]];
  }
  return hasCommentIn(sourceCode, range) ? undefined : replacing(range, '');
}
