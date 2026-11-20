import type { TSESTree } from '@typescript-eslint/utils';
import type { SchemaContext, SourceCode, ValidationLibrary } from './typed/library-types.mts';
import { hasKind } from '../syntax/kinds/node-kinds.mts';
import {
  destructuring,
  initializer,
  isUnresolved,
  libraryBinding,
  variableOf,
} from './module-bindings.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';
import {
  CALL_EXPRESSION,
  hasLibraryType,
  IDENTIFIER,
  isDerived,
  isNamespaceReceiver,
  looksLikeSchema,
  MEMBER_EXPRESSION,
  methodNameOf,
  SCHEMA_NAME,
} from './schema/schema-receivers.mts';

const PASS_THROUGH = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'AwaitExpression',
  'ChainExpression',
]);

export function schemaContext(context: { readonly sourceCode: SourceCode }): SchemaContext {
  return { sourceCode: context.sourceCode, services: context.sourceCode.parserServices };
}

function isMethodOn(
  ctx: SchemaContext,
  { receiver, method }: { receiver: TSESTree.Node; method: string },
  library: ValidationLibrary,
): boolean {
  const { packages } = library;
  return (
    library.anyReceiver.includes(method) ||
    (library.derivedReceiver.includes(method) &&
      (isDerived(ctx, receiver, packages) || looksLikeSchema(ctx, receiver, packages))) ||
    (library.namespace.includes(method) && isNamespaceReceiver(ctx, receiver, packages))
  );
}

function isMemberParse(
  ctx: SchemaContext,
  member: TSESTree.MemberExpression,
  library: ValidationLibrary,
): boolean {
  const method = methodNameOf(member);
  return method !== undefined && isMethodOn(ctx, { receiver: member.object, method }, library);
}

function isFactoryCall(
  ctx: SchemaContext,
  call: TSESTree.CallExpression,
  library: ValidationLibrary,
): boolean {
  const { callee } = call;
  if (hasKind(callee, MEMBER_EXPRESSION)) {
    const method = methodNameOf(callee);
    return (
      method !== undefined &&
      library.factories.includes(method) &&
      isNamespaceReceiver(ctx, callee.object, library.packages)
    );
  }
  const binding = hasKind(callee, IDENTIFIER)
    ? libraryBinding(variableOf(ctx.sourceCode, callee), library.packages)
    : undefined;
  return (
    binding !== undefined && binding.name !== undefined && library.factories.includes(binding.name)
  );
}

function isBoundParse(
  ctx: SchemaContext,
  call: TSESTree.CallExpression,
  library: ValidationLibrary,
): boolean {
  const { callee } = call;
  return (
    hasKind(callee, MEMBER_EXPRESSION) &&
    methodNameOf(callee) === 'bind' &&
    hasKind(callee.object, MEMBER_EXPRESSION) &&
    isMemberParse(ctx, callee.object, library)
  );
}

function isCallableSchema(
  ctx: SchemaContext,
  callee: TSESTree.Identifier,
  library: ValidationLibrary,
): boolean {
  const variable = variableOf(ctx.sourceCode, callee);
  return (
    library.callable &&
    (isDerived(ctx, initializer(variable), library.packages) ||
      (isUnresolved(variable) &&
        (SCHEMA_NAME.test(callee.name) || hasLibraryType(ctx, callee, library.packages))))
  );
}

function isIdentifierParse(
  ctx: SchemaContext,
  callee: TSESTree.Identifier,
  library: ValidationLibrary,
): boolean {
  const variable = variableOf(ctx.sourceCode, callee);
  const binding = libraryBinding(variable, library.packages);
  if (binding !== undefined) {
    return binding.name !== undefined && library.imported.includes(binding.name);
  }
  const init = initializer(variable);
  const method = destructuring(variable);
  return (
    (hasKind(init, CALL_EXPRESSION) &&
      (isFactoryCall(ctx, init, library) || isBoundParse(ctx, init, library))) ||
    (method !== undefined && isMethodOn(ctx, method, library)) ||
    isCallableSchema(ctx, callee, library)
  );
}

function isParseCall(
  ctx: SchemaContext,
  call: TSESTree.CallExpression,
  libraries: readonly ValidationLibrary[],
): boolean {
  const { callee } = call;
  return libraries.some((library) => {
    if (hasKind(callee, MEMBER_EXPRESSION)) {
      return isMemberParse(ctx, callee, library);
    }
    if (hasKind(callee, IDENTIFIER)) {
      return isIdentifierParse(ctx, callee, library);
    }
    return hasKind(callee, CALL_EXPRESSION) && isFactoryCall(ctx, callee, library);
  });
}

function isTransformCall(
  { sourceCode }: SchemaContext,
  call: TSESTree.CallExpression,
  libraries: readonly ValidationLibrary[],
): boolean {
  if (!hasKind(call.callee, IDENTIFIER)) {
    return false;
  }
  const variable = variableOf(sourceCode, call.callee);
  return libraries.some((library) => {
    const binding = libraryBinding(variable, library.packages);
    return (
      binding !== undefined &&
      binding.name !== undefined &&
      library.transform.includes(binding.name)
    );
  });
}

function isPipeInto(
  ctx: SchemaContext,
  { call, expression }: { call: TSESTree.CallExpression; expression: TSESTree.Node },
  libraries: readonly ValidationLibrary[],
): boolean {
  return (
    hasKind(call.callee, IDENTIFIER) &&
    call.callee.name === 'pipe' &&
    call.arguments[0] === expression &&
    call.arguments
      .slice(1)
      .some(
        (argument) =>
          hasKind(argument, MEMBER_EXPRESSION) &&
          libraries.some((library) => isMemberParse(ctx, argument, library)),
      )
  );
}

function isArgumentOf(call: TSESTree.CallExpression, node: TSESTree.Node): boolean {
  return call.arguments.some((argument) => argument === node);
}

function isFlowParent(identifier: TSESTree.Node): boolean {
  const parent = identifier.parent;
  return (
    parent !== undefined &&
    (PASS_THROUGH.has(parent.type) ||
      (hasKind(parent, CALL_EXPRESSION) && isArgumentOf(parent, identifier)) ||
      (hasKind(parent, 'VariableDeclarator') && parent.init === identifier))
  );
}

function flowTargets(
  ctx: SchemaContext,
  expression: TSESTree.Node,
  libraries: readonly ValidationLibrary[],
): true | TSESTree.Node[] {
  const parent = expression.parent;
  if (parent === undefined) {
    return [];
  }
  if (PASS_THROUGH.has(parent.type)) {
    return [parent];
  }
  if (hasKind(parent, CALL_EXPRESSION) && isArgumentOf(parent, expression)) {
    if (
      isParseCall(ctx, parent, libraries) ||
      isPipeInto(ctx, { call: parent, expression }, libraries)
    ) {
      return true;
    }
    return isTransformCall(ctx, parent, libraries) ? [parent] : [];
  }
  if (
    hasKind(parent, 'VariableDeclarator') &&
    parent.init === expression &&
    hasKind(parent.id, IDENTIFIER)
  ) {
    return ctx.sourceCode
      .getDeclaredVariables(parent)
      .flatMap((variable) => variable.references)
      .map((reference) => reference.identifier)
      .filter((identifier) => identifier !== parent.id && isFlowParent(identifier));
  }
  return [];
}

export function isParsedBySchema(
  ctx: SchemaContext,
  expression: TSESTree.Node,
  libraries: readonly ValidationLibrary[],
): boolean {
  const pending: TSESTree.Node[] = [expression];
  const seen = new Set<TSESTree.Node>();
  for (const node of pending) {
    if (seen.has(node)) {
      continue;
    }
    seen.add(node);
    const targets = flowTargets(ctx, node, libraries);
    if (targets === true) {
      return true;
    }
    appendAll(pending, targets);
  }
  return false;
}
