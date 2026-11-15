import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { catchLoggingFix } from '../../fixes/errors/catch-logging-fix.mts';
import { fixable } from '../../fixes/support/descriptors.mts';
import { librariesForFile as untypedLibrariesForFile } from '../../../libraries/file-libraries.mjs';
import { loggerShapes as untypedLoggerShapes } from '../../../libraries/project-libraries.mjs';
import type { Ranged, SourceCode } from '../typed/node-views.mts';
import { readHeadPolicy, type LibraryChoices } from '../typed/policy-views.mts';

type MessageId = 'caughtErrorShape' | 'caughtValueShape' | 'caughtEitherShape';
type Variable = TSESLint.Scope.Variable;
type CatchState = {
  readonly node: TSESTree.CatchClause;
  readonly variables: Variable[];
  readonly caught: Variable[];
  readonly initializers: Map<string, TSESTree.Node>;
};
type TypeWrapper =
  TSESTree.TSAsExpression | TSESTree.TSNonNullExpression | TSESTree.TSSatisfiesExpression;
type RuleContext = Readonly<TSESLint.RuleContext<MessageId, []>>;

const librariesForFile: (
  context: { readonly filename: string; readonly cwd: string },
  libraries: LibraryChoices | undefined,
) => LibraryChoices | undefined = untypedLibrariesForFile;
const loggerShapes: (libraries: LibraryChoices | undefined) => string[] = untypedLoggerShapes;

const ERROR_FIELD = 'err-field';

const LOG_METHODS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

function isLoggerCall(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    LOG_METHODS.has(node.callee.property.name)
  );
}

function rangeContains(outer: Ranged, inner: Ranged): boolean {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

function referencesCaughtValue(node: Ranged, variables: readonly Variable[]): boolean {
  return variables.some((variable) =>
    variable.references.some((reference) => rangeContains(node, reference.identifier)),
  );
}

function errorProperty(objectExpression: TSESTree.Node | undefined): TSESTree.Property | undefined {
  if (objectExpression?.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  return objectExpression.properties.find(
    (property): property is TSESTree.Property =>
      property.type === AST_NODE_TYPES.Property &&
      !property.computed &&
      ((property.key.type === AST_NODE_TYPES.Identifier && property.key.name === 'err') ||
        (property.key.type === AST_NODE_TYPES.Literal && property.key.value === 'err')),
  );
}

function isTypeWrapper(node: TSESTree.Node): node is TypeWrapper {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression
  );
}

function unwrap(node: TSESTree.Node | undefined): TSESTree.Node | undefined {
  const chain = [node];
  for (const current of chain) {
    if (current !== undefined && isTypeWrapper(current)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function isCaughtValue(node: TSESTree.Node | undefined, caught: readonly Variable[]): boolean {
  const inner = unwrap(node);
  return (
    inner?.type === AST_NODE_TYPES.Identifier &&
    caught.some((variable) =>
      variable.references.some((reference) => reference.identifier === inner),
    )
  );
}

function hasCaughtValueArgument(
  node: TSESTree.CallExpression,
  caught: readonly Variable[],
): boolean {
  return node.arguments.some(
    (argument) =>
      isCaughtValue(argument, caught) ||
      (argument.type === AST_NODE_TYPES.ObjectExpression &&
        argument.properties.some(
          (property) =>
            property.type === AST_NODE_TYPES.Property && isCaughtValue(property.value, caught),
        )),
  );
}

function hasErrorField(node: TSESTree.CallExpression, current: CatchState): boolean {
  const fields = followInitializers(node.arguments[0], current.initializers, new Set());
  const property = errorProperty(fields);
  const hasCaughtErrorProperty =
    property !== undefined &&
    property.value.type !== AST_NODE_TYPES.MemberExpression &&
    referencesCaughtValue(property.value, current.variables);
  return hasCaughtErrorProperty && node.arguments.length === 2 && hasMessageArgument(node);
}

function hasMessageArgument(node: TSESTree.CallExpression): boolean {
  const lastArgument = node.arguments.at(-1);
  return (
    (lastArgument?.type === AST_NODE_TYPES.Literal && typeof lastArgument.value === 'string') ||
    lastArgument?.type === AST_NODE_TYPES.TemplateLiteral
  );
}

function followInitializers(
  fields: TSESTree.Node | undefined,
  initializers: ReadonlyMap<string, TSESTree.Node>,
  visited: Set<string>,
): TSESTree.Node | undefined {
  let current = fields;
  const pending = [fields];
  for (const node of pending) {
    current = node;
    if (node?.type !== AST_NODE_TYPES.Identifier || visited.has(node.name)) {
      return node;
    }
    visited.add(node.name);
    pending.push(initializers.get(node.name));
  }
  return current;
}

function trackDeclarator(
  sourceCode: SourceCode,
  currentCatch: CatchState | undefined,
  node: TSESTree.VariableDeclarator,
): void {
  if (currentCatch === undefined) {
    return;
  }
  if (node.id.type === AST_NODE_TYPES.Identifier && node.init) {
    currentCatch.initializers.set(node.id.name, node.init);
  }
  if (node.init && referencesCaughtValue(node.init, currentCatch.variables)) {
    currentCatch.variables.push(...sourceCode.getDeclaredVariables(node));
  }
  if (isCaughtValue(node.init ?? undefined, currentCatch.caught)) {
    currentCatch.caught.push(...sourceCode.getDeclaredVariables(node));
  }
}

function loggingVisitors(context: RuleContext, shapes: readonly string[]): TSESLint.RuleListener {
  const sourceCode = context.sourceCode;
  const catchStack: CatchState[] = [];
  const messageId = messageIdFor(shapes);

  return {
    CatchClause(node) {
      const variables = sourceCode.getDeclaredVariables(node);
      catchStack.push({
        node,
        variables: [...variables],
        caught: [...variables],
        initializers: new Map(),
      });
    },
    VariableDeclarator(node) {
      trackDeclarator(sourceCode, catchStack.at(-1), node);
    },
    CallExpression(node) {
      const currentCatch = catchStack.at(-1);
      if (
        currentCatch === undefined ||
        !isLoggerCall(node) ||
        !referencesCaughtValue(node, currentCatch.variables)
      ) {
        return;
      }
      const accepted = shapes.some((shape) =>
        shape === ERROR_FIELD
          ? hasErrorField(node, currentCatch)
          : hasCaughtValueArgument(node, currentCatch.caught),
      );
      if (!accepted) {
        const isErrorField = shapes.length === 1 && shapes[0] === ERROR_FIELD;
        const plan = isErrorField
          ? catchLoggingFix(sourceCode, node, (argument) =>
              isCaughtValue(argument, currentCatch.caught),
            )
          : undefined;
        context.report(fixable({ node, messageId }, plan));
      }
    },
    'CatchClause:exit'() {
      catchStack.pop();
    },
  };
}

function messageIdFor(shapes: readonly string[]): MessageId {
  if (shapes.length > 1) {
    return 'caughtEitherShape';
  }
  return shapes[0] === ERROR_FIELD ? 'caughtErrorShape' : 'caughtValueShape';
}

export function structuredCatchLoggingRule(
  rootLibraries: LibraryChoices | undefined,
): TSESLint.RuleModule<MessageId> {
  return {
    meta: {
      type: 'problem',
      fixable: 'code',
      docs: {
        description: 'Keep a caught error on the logger call in the shape the project logger reads',
      },
      schema: [],
      messages: {
        caughtErrorShape:
          'Log a caught value as logger.<level>({ err: error, ...context }, message).',
        caughtValueShape: `Pass the caught value itself to the logger, for example logger.error('message', error), not its message or a template string.`,
        caughtEitherShape: `Log a caught value as logger.<level>({ err: error, ...context }, message), or pass the caught value itself, for example logger.error('message', error).`,
      },
    },
    create: (context) =>
      loggingVisitors(context, loggerShapes(librariesForFile(context, rootLibraries))),
  };
}

export const rule = structuredCatchLoggingRule(readHeadPolicy().libraries);
