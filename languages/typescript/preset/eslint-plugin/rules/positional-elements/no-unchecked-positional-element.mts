import path from 'node:path';
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import {
  isCallback,
  isGuard,
  isUnchecked,
  returnedElementUse,
  type UseNode,
} from './positional-usage.mts';
import { enclosingFunction, type FunctionNode } from '../typed/syntax-views.mts';

const PLAIN_SCRIPTS = new Set(['.js', '.mjs', '.cjs']);
const TUPLE_COMMENT = /(?:\{|:)\s*\[/u;
const TREE_LISTS = new Set(['children', 'namedChildren', 'childNodes']);

function memberRootName(node: TSESTree.Node): string | undefined {
  const chain = [node];
  for (const current of chain) {
    if (current.type === AST_NODE_TYPES.MemberExpression && !current.optional) {
      chain.push(current.object);
    }
  }
  const root = chain.at(-1);
  return root === node || root?.type !== AST_NODE_TYPES.Identifier ? undefined : root.name;
}

function parameterNames(fn: FunctionNode): Set<string> {
  return new Set(
    fn.params.flatMap((param) => {
      const name = param.type === AST_NODE_TYPES.Identifier ? param.name : undefined;
      return name === undefined ? [] : [name];
    }),
  );
}

function isFixedShape(pattern: TSESTree.ArrayPattern): boolean {
  return pattern.elements.filter((element) => element !== null).length >= 2;
}

function plainMemberRoot(node: TSESTree.MemberExpression): string | undefined {
  const chain: TSESTree.Node[] = [node];
  for (const current of chain) {
    if (current.type !== AST_NODE_TYPES.MemberExpression) {
      continue;
    }
    if (current.computed || current.optional) {
      return undefined;
    }
    chain.push(current.object);
  }
  const root = chain.at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}

function isArrayPattern(node: TSESTree.Node): node is TSESTree.ArrayPattern {
  return node.type === AST_NODE_TYPES.ArrayPattern;
}

function isObjectPattern(node: TSESTree.Node): node is TSESTree.ObjectPattern {
  return node.type === AST_NODE_TYPES.ObjectPattern;
}

function nestedArrayPatterns(root: TSESTree.ObjectPattern): TSESTree.ArrayPattern[] {
  const found: TSESTree.ArrayPattern[] = [];
  const pending = [root];
  for (const pattern of pending) {
    const values = pattern.properties.flatMap((property) =>
      property.type === AST_NODE_TYPES.Property ? [property.value] : [],
    );
    for (const value of values) {
      if (isArrayPattern(value)) {
        found.push(value);
      } else if (isObjectPattern(value)) {
        pending.push(value);
      }
    }
  }
  return found;
}

function arrayPatternsOf(fn: FunctionNode): TSESTree.ArrayPattern[] {
  const found = fn.params.flatMap((param) =>
    param.type === AST_NODE_TYPES.ObjectPattern ? nestedArrayPatterns(param) : [],
  );
  const [first] = fn.params;
  if (first?.type === AST_NODE_TYPES.ArrayPattern && isCallback(fn) && fromParameter(fn)) {
    found.push(first);
  }
  return found;
}

function fromParameter(fn: FunctionNode & { parent: TSESTree.CallExpression }): boolean {
  const { callee } = fn.parent;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const owner = enclosingFunction(fn);
  const root = memberRootName(callee.object);
  return owner !== undefined && root !== undefined && parameterNames(owner).has(root);
}

function isTuple(start: TSESTree.Node, sourceCode: Readonly<TSESLint.SourceCode>): boolean {
  return [start, ...ancestorsOf(start)].some(
    (node) =>
      node.type !== AST_NODE_TYPES.Program &&
      sourceCode.getCommentsBefore(node).some((comment) => TUPLE_COMMENT.test(comment.value)),
  );
}

type Site = {
  readonly sourceCode: Readonly<TSESLint.SourceCode>;
  readonly variables: ReadonlyMap<string, TSESLint.Scope.Variable>;
  readonly fn: FunctionNode | undefined;
};

type UncheckedContext = Readonly<TSESLint.RuleContext<'uncheckedElement', []>>;

function siteOf(
  sourceCode: Readonly<TSESLint.SourceCode>,
  scopeNode: TSESTree.Node,
  fn: FunctionNode | undefined,
): Site {
  const variables = new Map(
    sourceCode.getDeclaredVariables(scopeNode).map((variable) => [variable.name, variable]),
  );
  return { sourceCode, variables, fn };
}

function useOfElement(site: Site, element: TSESTree.Identifier): UseNode | undefined {
  const references =
    site.variables.get(element.name)?.references.filter((r) => r.identifier !== element) ?? [];
  if (references.some((reference) => isGuard(reference.identifier))) {
    return undefined;
  }
  const direct = references.find((reference) => isUnchecked(reference.identifier))?.identifier;
  if (direct !== undefined || site.fn === undefined) {
    return direct;
  }
  return returnedElementUse(site.sourceCode, site.fn, references);
}

function checkElements(context: UncheckedContext, pattern: TSESTree.ArrayPattern, site: Site) {
  for (const element of pattern.elements) {
    if (element?.type !== AST_NODE_TYPES.Identifier) {
      continue;
    }
    const use = useOfElement(site, element);
    if (use !== undefined) {
      context.report({ node: use, messageId: 'uncheckedElement', data: { name: element.name } });
    }
  }
}

function checkFunction(context: UncheckedContext, fn: FunctionNode): void {
  const { sourceCode } = context;
  if (isTuple(fn, sourceCode)) {
    return;
  }
  for (const pattern of arrayPatternsOf(fn)) {
    if (!isFixedShape(pattern)) {
      checkElements(context, pattern, siteOf(sourceCode, fn, fn));
    }
  }
}

function parameterListPattern(
  node: TSESTree.VariableDeclarator,
  sourceCode: Readonly<TSESLint.SourceCode>,
): TSESTree.ArrayPattern | undefined {
  const { id, init } = node;
  const owner = enclosingFunction(node);
  if (
    id.type !== AST_NODE_TYPES.ArrayPattern ||
    init?.type !== AST_NODE_TYPES.MemberExpression ||
    owner === undefined ||
    isTuple(node, sourceCode)
  ) {
    return undefined;
  }
  const property = init.computed ? undefined : nameOf(init.property);
  const root = plainMemberRoot(init);
  const fixedOutsideTree = isFixedShape(id) && !TREE_LISTS.has(property ?? '');
  return root === undefined ||
    property === undefined ||
    !parameterNames(owner).has(root) ||
    fixedOutsideTree
    ? undefined
    : id;
}

function isPlainScriptWithoutTypes(context: UncheckedContext): boolean {
  return (
    PLAIN_SCRIPTS.has(path.extname(context.filename).toLowerCase()) &&
    !context.sourceCode.text.includes('@ts-check')
  );
}

export const rule: TSESLint.RuleModule<'uncheckedElement'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow unchecked array elements taken from a parameter in untyped JavaScript',
    },
    schema: [],
    messages: {
      uncheckedElement:
        'The element "{{name}}" is taken from an array of a parameter by position and used without a test. The function does not control the length of that array, so the element can be undefined (a converted parser error node, a missing child) and the failure shows up later, far from the cause. Test it for undefined, give it a default, or skip the item.',
    },
  },
  create(context) {
    if (!isPlainScriptWithoutTypes(context)) {
      return {};
    }
    const { sourceCode } = context;
    function check(fn: FunctionNode): void {
      checkFunction(context, fn);
    }
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
      VariableDeclarator(node) {
        const pattern = parameterListPattern(node, sourceCode);
        if (pattern !== undefined) {
          checkElements(context, pattern, siteOf(sourceCode, node, undefined));
        }
      },
    };
  },
};
