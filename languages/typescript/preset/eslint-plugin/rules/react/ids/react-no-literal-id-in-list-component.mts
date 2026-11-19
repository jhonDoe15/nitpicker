import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import { type FunctionNode } from '../../typed/syntax-views.mts';
import { enclosingComponent } from '../support/component-names.mts';
import { renderedPerItemElsewhere } from '../support/render-sites.mts';
import { exportNameOf, isRenderedPerItem, literalText } from './list-renders.mts';

type Candidate = {
  readonly attribute: TSESTree.JSXAttribute;
  readonly value: string;
  readonly fn: FunctionNode;
  readonly name: string;
};

const referenceAttributes = new Set([
  'htmlFor',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-owns',
  'list',
  'form',
]);
const lookupMethods = new Set(['getElementById', 'querySelector']);
const capitalized = /^[A-Z]/u;

function calledMethod({ callee }: TSESTree.CallExpression): string | undefined {
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? nameOf(callee.property)
    : undefined;
}

function addIds(known: Set<string> | undefined, text: string): Set<string> {
  const ids = known ?? new Set<string>();
  for (const id of text.split(/\s+/u)) {
    ids.add(id.replace(/^#/u, ''));
  }
  return ids;
}

export const rule: TSESLint.RuleModule<'literalId'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow a literal DOM id in a component rendered once per item' },
    schema: [],
    messages: {
      literalId:
        'This component is rendered once per item, so the literal id `{{id}}` repeats on the page ' +
        'and its label or `aria-*` reference points at the first copy. Use `useId()` ' +
        `(\`const id = useId();\`), an id built from the item (\`\${prefix}-\${item.id}\`), or an id ` +
        'passed in by the parent.',
    },
  },
  create(context) {
    const candidates: Candidate[] = [];
    const references = new Map<FunctionNode, Set<string>>();
    const listed = new Set<string>();

    function reference(node: TSESTree.Node, text: string): void {
      const owner = enclosingComponent(node);
      if (owner !== undefined) {
        references.set(owner.fn, addIds(references.get(owner.fn), text));
      }
    }

    return {
      JSXAttribute(node: TSESTree.JSXAttribute) {
        const key = node.name.type === AST_NODE_TYPES.JSXIdentifier ? node.name.name : undefined;
        const text = literalText(node.value ?? undefined);
        const owner = text === undefined ? undefined : enclosingComponent(node);
        if (key === 'id' && text !== undefined && owner !== undefined && text !== '') {
          candidates.push({ attribute: node, value: text, fn: owner.fn, name: owner.name });
        } else if (key !== undefined && text !== undefined && referenceAttributes.has(key)) {
          reference(node, text);
        }
      },
      CallExpression(node: TSESTree.CallExpression) {
        const method = calledMethod(node);
        const text = literalText(node.arguments[0]);
        if (method !== undefined && lookupMethods.has(method) && text !== undefined) {
          reference(node, text);
        }
      },
      JSXOpeningElement(node: TSESTree.JSXOpeningElement) {
        const name = node.name.type === AST_NODE_TYPES.JSXIdentifier ? node.name.name : undefined;
        if (name !== undefined && capitalized.test(name) && isRenderedPerItem(node)) {
          listed.add(name);
        }
      },
      'Program:exit'(program: TSESTree.Program) {
        for (const { attribute, value, fn, name } of candidates) {
          const exportName = listed.has(name) ? undefined : exportNameOf(program, name);
          const perItem =
            listed.has(name) ||
            (exportName !== undefined && renderedPerItemElsewhere(context.filename, exportName));
          if (perItem && references.get(fn)?.has(value) === true) {
            context.report({ node: attribute, messageId: 'literalId', data: { id: value } });
          }
        }
      },
    };
  },
};
