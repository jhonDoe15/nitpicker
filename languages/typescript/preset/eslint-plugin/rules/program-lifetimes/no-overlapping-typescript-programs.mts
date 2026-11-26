import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import { nameOf } from '../typed/node-views.mts';
import { enclosingFunction, outermostOf } from '../typed/syntax-views.mts';

type Build = {
  readonly owner: TSESTree.Node;
  readonly variables: readonly TSESLint.Scope.Variable[];
};

const { DefinitionType } = TSESLint.Scope;
const BUILDERS = new Set([
  'createProgram',
  'createWatchProgram',
  'createLanguageService',
  'createSemanticDiagnosticsBuilderProgram',
]);
const TYPESCRIPT = new Set(['typescript']);
const WRAPPERS = [
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
];

function importedFrom(context: SourceContext, node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = findVariable(context, node, node.name)?.defs[0];
  return definition?.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    TYPESCRIPT.has(definition.parent.source.value)
    ? definition.node
    : undefined;
}

function isBuild(context: SourceContext, call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    const owner = importedFrom(context, callee.object);
    return (
      BUILDERS.has(nameOf(callee.property) ?? '') &&
      (owner?.type === AST_NODE_TYPES.ImportNamespaceSpecifier ||
        owner?.type === AST_NODE_TYPES.ImportDefaultSpecifier)
    );
  }
  const specifier = importedFrom(context, callee);
  return (
    specifier?.type === AST_NODE_TYPES.ImportSpecifier &&
    BUILDERS.has(nameOf(specifier.imported) ?? '')
  );
}

function boundVariable(
  context: SourceContext,
  node: TSESTree.Node,
): TSESLint.Scope.Variable | undefined {
  const outer = node.parent;
  if (
    outer?.type !== AST_NODE_TYPES.VariableDeclarator ||
    outer.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  return findVariable(context, outer.id, outer.id.name);
}

function checkerVariables(
  context: SourceContext,
  program: TSESLint.Scope.Variable,
): TSESLint.Scope.Variable[] {
  return program.references.flatMap((reference) => {
    const member = reference.identifier.parent;
    const call = member.parent;
    if (
      member.type !== AST_NODE_TYPES.MemberExpression ||
      nameOf(member.property) !== 'getTypeChecker' ||
      call?.type !== AST_NODE_TYPES.CallExpression
    ) {
      return [];
    }
    return boundVariable(context, call) ?? [];
  });
}

function releasedAt(variable: TSESLint.Scope.Variable, call: TSESTree.CallExpression): number {
  let earliest = Number.POSITIVE_INFINITY;
  for (const reference of variable.references) {
    const write = reference.identifier.parent;
    if (reference.isWrite() && !reference.init && write.range[1] >= call.range[1]) {
      earliest = Math.min(earliest, write.range[0]);
    }
  }
  return earliest;
}

function readAfter(build: Build, call: TSESTree.CallExpression): boolean {
  return build.variables.some((variable) => {
    const released = releasedAt(variable, call);
    return variable.references.some(
      (reference) =>
        reference.isRead() &&
        reference.identifier.range[0] > call.range[1] &&
        reference.identifier.range[0] < released,
    );
  });
}

export const rule: TSESLint.RuleModule<'overlappingPrograms'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow building a second TypeScript program while the first is still referenced',
    },
    schema: [],
    messages: {
      overlappingPrograms:
        'This builds a second TypeScript program while the first one (or its type checker) is still read after this point. The first program, its syntax trees, binder symbols and checker caches cannot be collected, so the process needs room for both at once. Read what you need from the first program before building the second, or build each in its own function that returns plain data.',
    },
  },
  create(context) {
    const builds: Build[] = [];
    return {
      CallExpression(node) {
        if (!isBuild(context, node)) {
          return;
        }
        const owner = enclosingFunction(node) ?? context.sourceCode.ast;
        if (builds.some((build) => build.owner === owner && readAfter(build, node))) {
          context.report({ node, messageId: 'overlappingPrograms' });
        }
        const program = boundVariable(context, outermostOf(node, WRAPPERS));
        if (program !== undefined) {
          builds.push({ owner, variables: [program, ...checkerVariables(context, program)] });
        }
      },
    };
  },
};
