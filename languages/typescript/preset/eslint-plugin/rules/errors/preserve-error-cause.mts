import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf, type Ranged, type SourceCode } from '../typed/node-views.mts';
import { causeFix } from '../../fixes/errors/cause-fix.mts';
import { fixable } from '../../fixes/support/descriptors.mts';

type Wrapper = {
  readonly name?: string;
  readonly optionsIndex?: number | undefined;
  readonly classificationIndex?: number;
  readonly unclassifiedValue?: string;
};
type Options = readonly [{ readonly wrappers?: readonly Wrapper[] }?];
type CauseSite = {
  readonly wrapper: Wrapper;
  readonly node: TSESTree.NewExpression;
  readonly handler: TSESTree.CatchClause;
};

const ERROR_SUBCLASS_NAME = /Error$/;
const SUBCLASS_WRAPPER: Wrapper = { optionsIndex: undefined };

function wrapperFor(wrappers: readonly Wrapper[], name: string): Wrapper | undefined {
  const configured = wrappers.find((candidate) => candidate.name === name);
  if (configured !== undefined) {
    return configured;
  }
  return ERROR_SUBCLASS_NAME.test(name) ? SUBCLASS_WRAPPER : undefined;
}

function matchingWrapper(
  wrappers: readonly Wrapper[],
  node: TSESTree.NewExpression,
): Wrapper | undefined {
  if (node.callee.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const wrapper = wrapperFor(wrappers, node.callee.name);
  if (!wrapper) {
    return undefined;
  }
  const isClassified = wrapper.classificationIndex !== undefined;
  const classified =
    wrapper.classificationIndex === undefined
      ? undefined
      : node.arguments[wrapper.classificationIndex];
  const isUnclassified =
    (classified?.type === AST_NODE_TYPES.Literal ? classified.value : undefined) ===
    wrapper.unclassifiedValue;
  return isClassified && !isUnclassified ? undefined : wrapper;
}

function referencesCatch(
  caughtVariables: readonly TSESLint.Scope.Variable[],
  expression: Ranged,
): boolean {
  return caughtVariables.some((variable) =>
    variable.references.some(
      (reference) =>
        expression.range[0] <= reference.identifier.range[0] &&
        reference.identifier.range[1] <= expression.range[1],
    ),
  );
}

function keyValue(key: TSESTree.Node): unknown {
  return nameOf(key) ?? (key.type === AST_NODE_TYPES.Literal ? key.value : undefined);
}

function hasCauseProperty(
  options: TSESTree.Node | undefined,
  caughtVariables: readonly TSESLint.Scope.Variable[],
): boolean {
  return (
    options?.type === AST_NODE_TYPES.ObjectExpression &&
    options.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        keyValue(property.key) === 'cause' &&
        referencesCatch(caughtVariables, property.value),
    )
  );
}

function isCaughtValue(
  argument: TSESTree.Node,
  caughtVariables: readonly TSESLint.Scope.Variable[],
): boolean {
  const values = argument.type === AST_NODE_TYPES.ArrayExpression ? argument.elements : [argument];
  return values.some(
    (value) => value?.type === AST_NODE_TYPES.Identifier && referencesCatch(caughtVariables, value),
  );
}

function preservesCause(
  wrapper: Wrapper,
  node: TSESTree.NewExpression,
  caughtVariables: readonly TSESLint.Scope.Variable[],
): boolean {
  if (wrapper.optionsIndex !== undefined) {
    return hasCauseProperty(node.arguments[wrapper.optionsIndex], caughtVariables);
  }
  return node.arguments.some(
    (argument) =>
      hasCauseProperty(argument, caughtVariables) || isCaughtValue(argument, caughtVariables),
  );
}

function constAlias(
  sourceCode: SourceCode,
  { identifier }: TSESLint.Scope.Reference,
): readonly TSESLint.Scope.Variable[] {
  const declarator = identifier.parent;
  return declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.init === identifier &&
    declarator.parent.kind === 'const' &&
    declarator.id.type === AST_NODE_TYPES.Identifier
    ? sourceCode.getDeclaredVariables(declarator)
    : [];
}

function withAliases(
  sourceCode: SourceCode,
  caughtVariables: readonly TSESLint.Scope.Variable[],
): TSESLint.Scope.Variable[] {
  return [
    ...caughtVariables,
    ...caughtVariables.flatMap((variable) =>
      variable.references.flatMap((reference) => constAlias(sourceCode, reference)),
    ),
  ];
}

function isPromiseReject(call: TSESTree.Node): call is TSESTree.CallExpression {
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    !call.callee.computed &&
    call.callee.object.type === AST_NODE_TYPES.Identifier &&
    call.callee.object.name === 'Promise' &&
    call.callee.property.name === 'reject'
  );
}

function isThrownLocal(sourceCode: SourceCode, declarator: TSESTree.VariableDeclarator): boolean {
  return sourceCode
    .getDeclaredVariables(declarator)
    .some((variable) =>
      variable.references.some(
        ({ identifier }) => identifier.parent.type === AST_NODE_TYPES.ThrowStatement,
      ),
    );
}

function isThrown(sourceCode: SourceCode, node: TSESTree.NewExpression): boolean {
  const { parent } = node;
  if (parent.type === AST_NODE_TYPES.ThrowStatement) {
    return true;
  }
  if (isPromiseReject(parent)) {
    return parent.arguments[0] === node;
  }
  return (
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === node &&
    isThrownLocal(sourceCode, parent)
  );
}

function causeReport(
  sourceCode: SourceCode,
  { wrapper, node, handler }: CauseSite,
): 'bindingLess' | 'lostCause' | undefined {
  const caughtVariables = withAliases(sourceCode, sourceCode.getDeclaredVariables(handler));
  const thrown = isThrown(sourceCode, node);
  if (thrown && handler.param === null) {
    return 'bindingLess';
  }
  const wrapsCaught =
    wrapper.classificationIndex !== undefined || thrown || referencesCatch(caughtVariables, node);
  return wrapsCaught && !preservesCause(wrapper, node, caughtVariables) ? 'lostCause' : undefined;
}

const EXCEPTION_ROUTE =
  ' An exception fits only when the original failure is deliberately dropped.';

export const rule: TSESLint.RuleModule<'lostCause' | 'bindingLess', Options> = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          wrappers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                optionsIndex: { type: 'integer', minimum: 0 },
                classificationIndex: { type: 'integer', minimum: 0 },
                unclassifiedValue: { type: 'string' },
              },
              required: ['name', 'optionsIndex'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      lostCause: `Preserve the original cause when wrapping a caught failure: \`new AppError(message, { cause: error })\`.${EXCEPTION_ROUTE}`,
      bindingLess: `This catch has no binding, so the new failure loses the original cause. Bind it and pass it on: \`catch (error) { throw new AppError(message, { cause: error }); }\`.${EXCEPTION_ROUTE}`,
    },
  },
  create(context) {
    const wrappers = context.options[0]?.wrappers ?? [{ name: 'Error', optionsIndex: 1 }];
    return {
      NewExpression(node) {
        const wrapper = matchingWrapper(wrappers, node);
        if (!wrapper) {
          return;
        }
        const handler = ancestorsOf(node).find(
          (ancestor): ancestor is TSESTree.CatchClause =>
            ancestor.type === AST_NODE_TYPES.CatchClause,
        );
        if (!handler) {
          return;
        }
        const messageId = causeReport(context.sourceCode, { wrapper, node, handler });
        if (messageId !== undefined) {
          const plan =
            messageId === 'lostCause'
              ? causeFix(context.sourceCode, { wrapper, node, handler })
              : undefined;
          context.report(fixable({ node, messageId }, plan));
        }
      },
    };
  },
};
