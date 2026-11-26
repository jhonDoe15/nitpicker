import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { moduleValueOf } from '../module-values/bound-values.mts';
import type { FileContext } from '../../typed/node-views.mts';
import { calleeBinding } from '../module-values/module-facts.mts';
import { usesReactCompiler } from '../support/package-facts.mts';
import type { FunctionNode } from '../../typed/syntax-views.mts';
import { renderFunctionsOf, unstableKindOf, type UnstableKind } from './render-values.mts';

type Unstable = { readonly name: string; readonly kind: UnstableKind };

const skippedProps = new Set(['', 'key', 'ref', 'children']);
const HOOK_CALL = /\buse(?:[A-Z]\w*)?\s*(?:<[^()]*>)?\(/u;
const BODY_ADVICE = 'Pass values that stay the same between renders.';
const LIST_ADVICE =
  'Hooks cannot be called in a list callback: pass the item and a handler that stays the same between renders and let the row build the rest, or move the row into its own component that builds these values with the hooks named above.';
const stableForms: Readonly<Record<UnstableKind, string>> = {
  object: 'object: move it to module level or build it with `useMemo`',
  array: 'array: move it to module level or build it with `useMemo`',
  function: 'function: wrap it in `useCallback`',
  element: 'element: build it with `useMemo`',
};

function isMemoComponent(context: FileContext, name: TSESTree.JSXIdentifier): boolean {
  const resolved = moduleValueOf(context, name);
  if (resolved?.kind !== 'value' || resolved.shape.kind !== 'call') {
    return false;
  }
  const binding = calleeBinding(resolved.facts, resolved.shape.callee);
  return (
    binding?.source === 'react' && binding.name === 'memo' && resolved.shape.argumentCount === 1
  );
}

function canRenderAgain(sourceCode: FileContext['sourceCode'], component: FunctionNode): boolean {
  return component.params.length > 0 || HOOK_CALL.test(sourceCode.getText(component));
}

function hasRenderedChildren(element: TSESTree.JSXElement): boolean {
  return element.children.some((child) => child.type !== AST_NODE_TYPES.JSXText);
}

function attributeValue(attribute: TSESTree.JSXAttribute): TSESTree.Node | undefined {
  const { value } = attribute;
  if (value?.type === AST_NODE_TYPES.JSXExpressionContainer) {
    return value.expression.type === AST_NODE_TYPES.JSXEmptyExpression
      ? undefined
      : value.expression;
  }
  return value?.type === AST_NODE_TYPES.JSXElement ? value : undefined;
}

function ownAttributes(opening: TSESTree.JSXOpeningElement): TSESTree.JSXAttribute[] {
  const lastSpread = opening.attributes.findLastIndex(
    (attribute) => attribute.type === AST_NODE_TYPES.JSXSpreadAttribute,
  );
  return opening.attributes
    .slice(lastSpread + 1)
    .filter(
      (attribute): attribute is TSESTree.JSXAttribute =>
        attribute.type === AST_NODE_TYPES.JSXAttribute,
    );
}

export const rule: TSESLint.RuleModule<'unstableProps'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow props that are new on every render on a memo component',
    },
    schema: [],
    messages: {
      unstableProps:
        '`{{component}}` is wrapped in `memo`, but it is given a new value on every render for {{props}}, so the comparison never succeeds and `memo` only adds cost. {{advice}} When the component should render every time its parent does, remove `memo` from it.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    function unstableProps(
      opening: TSESTree.JSXOpeningElement,
      renderFunctions: readonly FunctionNode[],
    ): Unstable[] {
      return renderFunctions.length === 0
        ? []
        : ownAttributes(opening).flatMap((attribute): Unstable[] => {
            const name =
              attribute.name.type === AST_NODE_TYPES.JSXIdentifier ? attribute.name.name : '';
            const value = skippedProps.has(name) ? undefined : attributeValue(attribute);
            const kind =
              value === undefined ? undefined : unstableKindOf(sourceCode, value, renderFunctions);
            return kind === undefined ? [] : [{ name, kind }];
          });
    }
    return {
      JSXOpeningElement(node: TSESTree.JSXOpeningElement) {
        if (node.name.type !== AST_NODE_TYPES.JSXIdentifier || hasRenderedChildren(node.parent)) {
          return;
        }
        const chain = renderFunctionsOf(node);
        const component = chain.at(-1);
        const renderFunctions =
          component !== undefined && canRenderAgain(sourceCode, component) ? chain : [];
        const unstable = unstableProps(node, renderFunctions);
        if (
          unstable.length > 0 &&
          isMemoComponent(context, node.name) &&
          !usesReactCompiler(context.filename)
        ) {
          context.report({
            node,
            messageId: 'unstableProps',
            data: {
              component: node.name.name,
              advice: renderFunctions.length > 1 ? LIST_ADVICE : BODY_ADVICE,
              props: unstable
                .map(({ name, kind }) => `\`${name}\` (${stableForms[kind]})`)
                .join(', '),
            },
          });
        }
      },
    };
  },
};
