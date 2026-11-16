import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../typed/node-views.mts';
import { findVariable } from '../analysis/constant-resolution.mts';
import {
  isGlobalObject,
  isProcessModule,
  isProcessValue,
  propertyName,
  staticName,
  wrapperTop,
} from '../analysis/globals/process-values.mts';
import {
  isCompositionRootFile,
  type CompositionRootOptions,
} from '../boundaries/composition-root-files.mts';

const CONSOLE = 'console';

type MessageIds = 'consoleCall' | 'streamOutsideRoot';
type Context = Readonly<TSESLint.RuleContext<MessageIds, CompositionRootOptions>>;
type State = { readonly context: Context; readonly streamsAllowed: boolean };
type Specifier = TSESTree.ImportClause | TSESTree.ExportSpecifier;
type StreamUse = { readonly node: TSESTree.Node; readonly stream: string };
type TypeOnlyNode =
  | Specifier
  | TSESTree.ImportDeclaration
  | TSESTree.ExportNamedDeclaration
  | TSESTree.ExportAllDeclaration;

export function consoleMethodOf(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === CONSOLE &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

const STANDARD_STREAMS = new Set<string | undefined>(['stdout', 'stderr']);
const ALL_STREAMS = 'stdout and process.stderr';

function streamNamed(name: string | undefined): string | undefined {
  return STANDARD_STREAMS.has(name) ? name : undefined;
}

function streamUse(node: TSESTree.Node, name: string | undefined): StreamUse[] {
  const stream = streamNamed(name);
  return stream === undefined ? [] : [{ node, stream }];
}

function patternSource(pattern: TSESTree.ObjectPattern): TSESTree.Node | undefined {
  const { parent } = pattern;
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id === pattern) {
    return parent.init ?? undefined;
  }
  return (parent.type === AST_NODE_TYPES.AssignmentExpression ||
    parent.type === AST_NODE_TYPES.AssignmentPattern) &&
    parent.left === pattern
    ? parent.right
    : undefined;
}

function isTypeOnly(node: TypeOnlyNode): boolean {
  return (
    ('importKind' in node && node.importKind === 'type') ||
    ('exportKind' in node && node.exportKind === 'type')
  );
}

function namedStreams(
  specifiers: readonly Specifier[],
  nameOf: (specifier: Specifier) => string | undefined,
): StreamUse[] {
  return specifiers
    .filter((node) => !isTypeOnly(node))
    .flatMap((node) => streamUse(node, nameOf(node)));
}

function nameText(node: TSESTree.Identifier | TSESTree.StringLiteral): string {
  return node.type === AST_NODE_TYPES.Identifier ? node.name : node.value;
}

function restStreamReads(context: Context, pattern: TSESTree.ObjectPattern): StreamUse[] {
  return pattern.properties
    .flatMap((property) =>
      property.type === AST_NODE_TYPES.RestElement &&
      property.argument.type === AST_NODE_TYPES.Identifier
        ? [property.argument]
        : [],
    )
    .flatMap((argument) => findVariable(context, argument, argument.name)?.references ?? [])
    .map(({ identifier }) => identifier.parent)
    .flatMap((parent) =>
      parent.type === AST_NODE_TYPES.MemberExpression ? streamUse(parent, staticName(parent)) : [],
    );
}

function consoleReference(
  sourceCode: SourceCode,
  use: TSESTree.Node,
): { readonly node: TSESTree.Node; readonly reference: string } {
  const top = wrapperTop(use);
  const { parent } = top;
  if (parent?.type !== AST_NODE_TYPES.MemberExpression || parent.object !== top) {
    return { node: top, reference: CONSOLE };
  }
  const name = staticName(parent);
  const access = name === undefined ? `[${sourceCode.getText(parent.property)}]` : `.${name}`;
  const callee = wrapperTop(parent);
  const isCall =
    callee.parent?.type === AST_NODE_TYPES.CallExpression && callee.parent.callee === callee;
  return { node: parent, reference: `console${access}${isCall ? '()' : ''}` };
}

function isTypeContext(use: TSESTree.Node): boolean {
  const { parent } = wrapperTop(use);
  return (
    parent?.type === AST_NODE_TYPES.TSTypeQuery ||
    (parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'typeof')
  );
}

function globalConsoleUses(sourceCode: SourceCode): TSESTree.Node[] {
  const globalScope = sourceCode.scopeManager?.globalScope;
  if (globalScope === undefined || globalScope === null) {
    return [];
  }
  const declared = globalScope.set.get(CONSOLE);
  const resolved = declared?.defs.length === 0 ? declared.references : [];
  return [
    ...resolved,
    ...globalScope.through.filter(({ identifier }) => identifier.name === CONSOLE),
  ]
    .map(({ identifier }) => identifier)
    .filter((identifier) => !isTypeContext(identifier));
}

function reportStreams({ context, streamsAllowed }: State, found: StreamUse[]): void {
  for (const { node, stream } of streamsAllowed ? [] : found) {
    context.report({ node, messageId: 'streamOutsideRoot', data: { stream } });
  }
}

function reportConsole({ context }: State, node: TSESTree.Node, reference: string): void {
  context.report({ node, messageId: 'consoleCall', data: { reference } });
}

function checkMember(state: State, node: TSESTree.MemberExpression): void {
  const { context } = state;
  const name = staticName(node);
  if (name === CONSOLE && isGlobalObject(context, node.object)) {
    const { node: reported, reference } = consoleReference(context.sourceCode, node);
    reportConsole(state, reported, reference);
  }
  const stream = streamNamed(name);
  if (stream !== undefined && isProcessValue(context, node.object)) {
    reportStreams(state, [{ node, stream }]);
  }
}

function checkPattern(state: State, pattern: TSESTree.ObjectPattern): void {
  const { context } = state;
  const source = patternSource(pattern);
  if (source === undefined) {
    return;
  }
  const properties = pattern.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property ? [property] : [],
  );
  if (isGlobalObject(context, source)) {
    for (const property of properties.filter((entry) => propertyName(entry) === CONSOLE)) {
      reportConsole(state, property, CONSOLE);
    }
  }
  if (isProcessValue(context, source)) {
    reportStreams(state, [
      ...properties.flatMap((node) => streamUse(node, propertyName(node))),
      ...restStreamReads(context, pattern),
    ]);
  }
}

function importedName(specifier: Specifier): string | undefined {
  return specifier.type === AST_NODE_TYPES.ImportSpecifier
    ? nameText(specifier.imported)
    : undefined;
}

function localName(specifier: Specifier): string {
  return nameText(specifier.local);
}

function checkImport(state: State, declaration: TSESTree.ImportDeclaration): void {
  if (isProcessModule(declaration.source.value) && !isTypeOnly(declaration)) {
    reportStreams(state, namedStreams(declaration.specifiers, importedName));
  }
}

function checkReexport(
  state: State,
  declaration: TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration,
): void {
  const { source } = declaration;
  if (source === null || !isProcessModule(source.value) || isTypeOnly(declaration)) {
    return;
  }
  const found =
    declaration.type === AST_NODE_TYPES.ExportAllDeclaration
      ? [{ node: declaration, stream: ALL_STREAMS }]
      : namedStreams(declaration.specifiers, localName);
  reportStreams(state, found);
}

export const rule: TSESLint.RuleModule<MessageIds, CompositionRootOptions> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep production logging on the application logger path',
    },
    schema: [
      {
        type: 'object',
        properties: {
          compositionRootPattern: { type: 'string' },
          allowStandardStreams: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      consoleCall:
        'Use the application logger instead of {{reference}}. Program output goes through a `{ write(text: string): void }` parameter that the composition root fills with process.stdout or process.stderr. An exception fits only when this module is a script that prints the program output.',
      streamOutsideRoot:
        'Reach process.{{stream}} only in the composition root or an entry point: take a `{ write(text: string): void }` parameter and write through it, and let the entry pass process.stdout or process.stderr (and any isTTY or columns value) as an argument. An exception fits only when this module is a script that prints the program output.',
    },
  },
  create(context) {
    const state: State = {
      context,
      streamsAllowed:
        context.options[0]?.['allowStandardStreams'] === true || isCompositionRootFile(context),
    };
    return {
      Program() {
        for (const use of globalConsoleUses(context.sourceCode)) {
          const { node, reference } = consoleReference(context.sourceCode, use);
          reportConsole(state, node, reference);
        }
      },
      MemberExpression(node: TSESTree.MemberExpression) {
        checkMember(state, node);
      },
      ObjectPattern(node: TSESTree.ObjectPattern) {
        checkPattern(state, node);
      },
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        checkImport(state, node);
      },
      ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration) {
        checkReexport(state, node);
      },
      ExportAllDeclaration(node: TSESTree.ExportAllDeclaration) {
        checkReexport(state, node);
      },
    };
  },
};
