import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../analysis/constant-resolution.mts';
import { resolveConstant } from '../analysis/test-code-analysis.mts';

type Scan = {
  readonly pending: (TSESTree.Node | undefined)[];
  readonly keys: Set<string>;
};

function collectProperty(
  { pending, keys }: Scan,
  property: TSESTree.ObjectLiteralElement,
  keyName: (property: TSESTree.Property) => string | undefined,
): void {
  if (property.type === AST_NODE_TYPES.SpreadElement) {
    pending.push(property.argument);
    return;
  }
  const name = keyName(property);
  if (name !== undefined) {
    keys.add(name);
  }
}

export function collectObjectKeys(
  context: SourceContext,
  node: TSESTree.Node | undefined,
  keyName: (property: TSESTree.Property) => string | undefined,
): { readonly keys: Set<string>; readonly complete: boolean } {
  const pending = [node];
  const seen = new Set<TSESTree.Node>();
  const keys = new Set<string>();
  let complete = true;
  for (const current of pending) {
    const resolved = resolveConstant(context, current);
    if (resolved?.type !== AST_NODE_TYPES.ObjectExpression || seen.has(resolved)) {
      complete = false;
      continue;
    }
    seen.add(resolved);
    for (const property of resolved.properties) {
      collectProperty({ pending, keys }, property, keyName);
    }
  }
  return { keys, complete };
}
