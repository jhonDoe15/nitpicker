import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../analysis/constant-resolution.mts';
import { depthFirst, nodeChildren } from '../typed/node-views.mts';
import { enclosingFunction } from '../typed/syntax-views.mts';
import { inTemp, nameOfCall, propertyNamed, scopeOf } from './temp-paths.mts';

const LINKERS = new Set(['symlink', 'symlinkSync', 'cp', 'cpSync', 'copyFile', 'copyFileSync']);
const LOOPS = new Set(['forEach', 'map']);
const SPAWNERS = new Set([
  'spawn',
  'spawnSync',
  'exec',
  'execSync',
  'execFile',
  'execFileSync',
  'fork',
  'execa',
  'execaSync',
]);
const WRITERS = new Set(['writeFile', 'writeFileSync']);
const CONFIG_FLAGS = new Set(['--tsconfig', '-p', '--project']);
const RESOLUTION_HINT =
  /node_modules|NODE_PATH|typeRoots|preserve-symlinks|\bpaths\s*:|['"`]paths['"`]/u;
const CONFIG_FILE = /tsconfig[\w.-]*\.json|package\.json/u;

function isReaddir(context: SourceContext, node: TSESTree.Node | undefined): boolean {
  const value = resolveConstant(context, node);
  const call = value?.type === AST_NODE_TYPES.AwaitExpression ? value.argument : value;
  return call !== undefined && /^readdir/u.test(nameOfCall(call));
}

function loopOwner(
  context: SourceContext,
  node: TSESTree.Node,
  program: TSESTree.Node,
): TSESTree.Node | undefined {
  const callback = enclosingFunction(node);
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (current === callback) {
      const call = current.parent;
      return call?.type === AST_NODE_TYPES.CallExpression &&
        call.callee.type === AST_NODE_TYPES.MemberExpression &&
        LOOPS.has(nameOfCall(call)) &&
        isReaddir(context, call.callee.object)
        ? scopeOf(call, program)
        : undefined;
    }
    if (current.type === AST_NODE_TYPES.ForOfStatement) {
      return isReaddir(context, current.right) ? scopeOf(node, program) : undefined;
    }
  }
  return undefined;
}

function mentionsConfigFile(node: TSESTree.Node): boolean {
  return [...depthFirst<TSESTree.Node>(node, nodeChildren)].some(
    (part) =>
      part.type === AST_NODE_TYPES.Literal &&
      typeof part.value === 'string' &&
      CONFIG_FILE.test(part.value),
  );
}

function usesStage(context: SourceContext, call: TSESTree.CallExpression): boolean {
  const name = nameOfCall(call);
  if (WRITERS.has(name)) {
    const [target] = call.arguments;
    return target !== undefined && inTemp(context, target) && mentionsConfigFile(target);
  }
  return SPAWNERS.has(name) && call.arguments.some((argument) => spawnsInStage(context, argument));
}

function spawnsInStage(context: SourceContext, argument: TSESTree.Node): boolean {
  const value = resolveConstant(context, argument);
  if (value?.type === AST_NODE_TYPES.ObjectExpression) {
    const cwd = propertyNamed(value, 'cwd');
    return cwd !== undefined && inTemp(context, cwd.value);
  }
  if (value?.type !== AST_NODE_TYPES.ArrayExpression) {
    return false;
  }
  return value.elements.some((element, index) => {
    const flag = resolveConstant(context, element ?? undefined);
    const following = value.elements[index + 1];
    return (
      flag?.type === AST_NODE_TYPES.Literal &&
      typeof flag.value === 'string' &&
      CONFIG_FLAGS.has(flag.value) &&
      following !== null &&
      following !== undefined &&
      inTemp(context, following)
    );
  });
}

export const rule: TSESLint.RuleModule<'stagedModules'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a project staged in a temporary folder to carry the node_modules of its parent folders',
    },
    schema: [],
    messages: {
      stagedModules:
        'This links or copies the entries of a folder into a temporary folder and then runs a tool or writes a config there. Module resolution in the copy walks up from the temporary folder, not from the project, so packages installed in a parent node_modules (a hoisted workspace) are not found. Link each parent node_modules at the matching level above the copy, or run the tool in the project.',
    },
  },
  create(context) {
    if (RESOLUTION_HINT.test(context.sourceCode.text)) {
      return {};
    }
    const links = new Map<TSESTree.Node, TSESTree.CallExpression>();
    const uses = new Set<TSESTree.Node>();
    return {
      CallExpression(node) {
        const program = context.sourceCode.ast;
        const [, target] = node.arguments;
        const owner =
          LINKERS.has(nameOfCall(node)) && target !== undefined && inTemp(context, target)
            ? loopOwner(context, node, program)
            : undefined;
        if (owner !== undefined && !links.has(owner)) {
          links.set(owner, node);
        }
        if (usesStage(context, node)) {
          uses.add(scopeOf(node, program));
        }
      },
      'Program:exit'() {
        for (const [scope, link] of links) {
          if (uses.has(scope)) {
            context.report({ node: link, messageId: 'stagedModules' });
          }
        }
      },
    };
  },
};
