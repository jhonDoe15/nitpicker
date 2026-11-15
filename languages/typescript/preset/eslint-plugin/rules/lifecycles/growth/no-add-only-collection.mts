import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import { closersOf } from '../scope/close-owners.mts';
import { addedValue, holdsSettlers } from '../pending/pending-values.mts';
import { collectionsOf, destructuredFromThis, useKind, usesOf } from '../scope/collections.mts';
import {
  adderName,
  growingAdds,
  isDeclaration,
  isLongLived,
  isRemoved,
  type Container,
} from './growth-facts.mts';

export const rule: TSESLint.RuleModule<'grows'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a long-lived Map, Set or array that its scope adds to and never removes from',
    },
    schema: [],
    messages: {
      grows:
        '{{name}} only grows: {{adder}} adds to it, and nothing in this scope deletes, clears or bounds it, so memory grows for the life of the process. Remove the entry when its request, session or run ends (in `finally` or the close handler), bound it (check `{{name}}.{{bound}}` before the add, or use an LRU or TTL cache), or key a `WeakMap` by the object. A registry filled at startup (literal keys, or an init or register function) is skipped. An exception fits only when the keys are a fixed finite set.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    function check(container: Container): void {
      if (!isLongLived(container, closersOf(container))) {
        return;
      }
      const seen = new Set<string | undefined>();
      for (const binding of collectionsOf(sourceCode, container)) {
        if (seen.has(binding.name)) {
          continue;
        }
        seen.add(binding.name);
        const uses = usesOf(binding, container).filter((use) => !isDeclaration(use));
        const adds = growingAdds(uses, container);
        const settlers = uses.flatMap((use) => {
          const found = useKind(use);
          return found.kind === 'add' ? [addedValue(found)] : [];
        });
        const owned = holdsSettlers(binding, settlers) && closersOf(container).length > 0;
        const aliased =
          container.type === AST_NODE_TYPES.ClassBody &&
          destructuredFromThis(container, binding.name);
        const [firstAdd] = adds;
        if (firstAdd !== undefined && !owned && !aliased && !isRemoved(uses)) {
          context.report({
            node: binding.node,
            messageId: 'grows',
            data: {
              name:
                container.type === AST_NODE_TYPES.ClassBody
                  ? `this.${String(binding.name)}`
                  : binding.name,
              adder: adderName(firstAdd),
              bound: binding.kind === 'Array' ? 'length' : 'size',
            },
          });
        }
      }
    }

    return {
      ClassBody: check,
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression': check,
    };
  },
};
